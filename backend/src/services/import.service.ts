import path from "path";
import fs from "fs/promises";
import { ImportSource } from "@prisma/client";
import { parseKeepaCSV } from "../lib/keepaCsvParser";
import { productsRepository, UpsertProductData } from "../repositories/products.repository";
import { importRepository } from "../repositories/import.repository";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { redisConnection } from "../lib/queue";
import { v4 as uuidv4 } from "uuid";

export interface ImportSummary {
  importFileId: number;
  jobId: string;
  inserted_rows: number;
  updated_rows: number;
  failed_rows: number;
  total_rows: number;
  errors: Array<{ row: number; reason: string; rawData?: string }>;
  errorFilePath?: string;
}

export interface ImportProgress {
  jobId: string;
  status: "processing" | "completed" | "failed";
  total: number;
  processed: number;
  startedAt: string;
  completedAt?: string;
  summary?: {
    importFileId: number;
    total_rows: number;
    inserted_rows: number;
    updated_rows: number;
    failed_rows: number;
    hasErrors: boolean;
    errors: Array<{ row: number; reason: string; rawData?: string }>;
  };
}

const IMPORT_JOB_PREFIX = "import:job:";
const HAZMAT_TAG_NAME = "H";

// ── Helper functions (no `this` ambiguity) ──────────────────────────────────

async function updateProgress(jobId: string, processed: number, total: number): Promise<void> {
  const key = `${IMPORT_JOB_PREFIX}${jobId}`;
  const raw = await redisConnection.get(key);
  if (!raw) return;

  const progress = JSON.parse(raw) as ImportProgress;
  progress.processed = processed;
  progress.status = "processing";

  await redisConnection.setex(key, 3600, JSON.stringify(progress));
}

async function markCompleted(jobId: string, summary?: ImportProgress["summary"]): Promise<void> {
  const key = `${IMPORT_JOB_PREFIX}${jobId}`;
  const raw = await redisConnection.get(key);
  if (!raw) return;

  const progress = JSON.parse(raw) as ImportProgress;
  progress.status = "completed";
  progress.completedAt = new Date().toISOString();
  if (summary) progress.summary = summary;

  await redisConnection.setex(key, 3600, JSON.stringify(progress));
}

async function markFailed(jobId: string): Promise<void> {
  const key = `${IMPORT_JOB_PREFIX}${jobId}`;
  const raw = await redisConnection.get(key);
  if (!raw) return;

  const progress = JSON.parse(raw) as ImportProgress;
  progress.status = "failed";
  progress.completedAt = new Date().toISOString();

  await redisConnection.setex(key, 3600, JSON.stringify(progress));
}

async function processCSVImport(
  jobId: string,
  buffer: Buffer,
  fileName: string,
  source: ImportSource,
  valid: UpsertProductData[],
  errors: Array<{ row: number; reason: string; rawData?: string }>,
  totalRows: number,
): Promise<void> {
  // Create ImportFile record
  const importFile = await importRepository.create({
    file_name: fileName,
    source,
    file: buffer,
    total_rows: totalRows,
  });

  let insertedRows = 0;
  let updatedRows = 0;

  if (valid.length > 0) {
    const asins = valid.map((p) => p.asin);
    const hazmatAsins = valid.filter((p) => p.is_hazmat === true).map((p) => p.asin);

    // Find already-existing ASINs (lightweight query)
    const existingRecords = await prisma.product.findMany({
      where: { asin: { in: asins } },
      select: { asin: true },
    });
    const existingAsins = new Set(existingRecords.map((p) => p.asin));

    for (const asin of asins) {
      if (existingAsins.has(asin)) {
        updatedRows++;
      } else {
        insertedRows++;
      }
    }

    // Upsert in batches
    const BATCH_SIZE = 100;
    const numBatches = Math.ceil(valid.length / BATCH_SIZE);

    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE);
      await productsRepository.upsertMany(batch);

      const processed = Math.min(i + BATCH_SIZE, valid.length);
      await updateProgress(jobId, processed, valid.length);
      logger.info(`[import:${jobId}] Batch ${i / BATCH_SIZE + 1}/${numBatches} done — ${processed}/${valid.length}`);
    }

    if (hazmatAsins.length > 0) {
      const hazmatTag = await prisma.tag.upsert({
        where: { name: HAZMAT_TAG_NAME },
        update: {},
        create: { name: HAZMAT_TAG_NAME, type: "warning" },
      });

      await prisma.productTag.createMany({
        data: hazmatAsins.map((asin) => ({ asin, tag_id: hazmatTag.id })),
        skipDuplicates: true,
      });

      logger.info(`Assigned tag "${HAZMAT_TAG_NAME}" to ${hazmatAsins.length} HazMat products`);
    }
  }

  // Save error file if there are errors
  let errorFilePath: string | undefined;
  if (errors.length > 0) {
    const errorsDir = "uploads/errors";
    await fs.mkdir(errorsDir, { recursive: true });
    errorFilePath = path.join(errorsDir, `errors_${importFile.id}_${Date.now()}.json`);
    await fs.writeFile(errorFilePath, JSON.stringify(errors, null, 2), "utf-8");
    logger.warn(`Saved ${errors.length} import errors to ${errorFilePath}`);
  }

  // Update ImportFile with summary
  await importRepository.updateSummary(importFile.id, {
    inserted_rows: insertedRows,
    updated_rows: updatedRows,
    failed_rows: errors.length,
    error_file_path: errorFilePath,
  });

  // Mark job as completed with summary in Redis
  await markCompleted(jobId, {
    importFileId: importFile.id,
    total_rows: totalRows,
    inserted_rows: insertedRows,
    updated_rows: updatedRows,
    failed_rows: errors.length,
    hasErrors: errors.length > 0,
    errors: errors.slice(0, 50),
  });

  logger.info(`[import:${jobId}] Completed — ${insertedRows} inserted, ${updatedRows} updated, ${errors.length} failed`);
}

// ── Exported service ─────────────────────────────────────────────────────────

export const importService = {
  /**
   * Parses the CSV, initializes progress in Redis, kicks off background processing,
   * and returns immediately with the jobId so the frontend can start polling.
   */
  async startCSVImport(
    buffer: Buffer,
    fileName: string,
    source: ImportSource = "keepa",
  ): Promise<{ jobId: string; totalValid: number }> {
    const jobId = uuidv4();

    // Parse CSV (fast — just string parsing)
    const { valid, errors, totalRows } = parseKeepaCSV(buffer);
    logger.info(`CSV parse: ${totalRows} total rows, ${valid.length} valid, ${errors.length} errors`);

    // Initialize progress in Redis
    const initialProgress: ImportProgress = {
      jobId,
      status: "processing",
      total: valid.length,
      processed: 0,
      startedAt: new Date().toISOString(),
    };
    await redisConnection.setex(
      `${IMPORT_JOB_PREFIX}${jobId}`,
      3600,
      JSON.stringify(initialProgress)
    );

    // Run actual DB work in background (don't await)
    processCSVImport(jobId, buffer, fileName, source, valid, errors, totalRows).catch((err) => {
      logger.error(`Import job ${jobId} failed:`, err);
      markFailed(jobId);
    });

    return { jobId, totalValid: valid.length };
  },

  async getProgress(jobId: string): Promise<ImportProgress | null> {
    const key = `${IMPORT_JOB_PREFIX}${jobId}`;
    const raw = await redisConnection.get(key);
    if (!raw) return null;

    return JSON.parse(raw) as ImportProgress;
  },

  async importManualAsin(asin: string): Promise<ImportSummary> {
    const trimmed = asin.trim().toUpperCase();

    if (!trimmed || trimmed.length !== 10) {
      throw new Error("Invalid ASIN: must be 10 characters");
    }

    const importFile = await importRepository.create({
      file_name: `manual:${trimmed}`,
      source: "manual",
      total_rows: 1,
    });

    try {
      await productsRepository.upsertMany([{ asin: trimmed }]);

      await importRepository.updateSummary(importFile.id, {
        inserted_rows: 1,
        updated_rows: 0,
        failed_rows: 0,
      });

      return {
        importFileId: importFile.id,
        jobId: "",
        inserted_rows: 1,
        updated_rows: 0,
        failed_rows: 0,
        total_rows: 1,
        errors: [],
      };
    } catch (err) {
      await importRepository.updateSummary(importFile.id, {
        inserted_rows: 0,
        updated_rows: 0,
        failed_rows: 1,
      });
      throw err;
    }
  },

  async getHistory() {
    return importRepository.findMany();
  },
};
