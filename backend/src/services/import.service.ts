import path from "path";
import fs from "fs/promises";
import { ImportSource } from "@prisma/client";
import { parseKeepaCSV } from "../lib/keepaCsvParser";
import { productsRepository } from "../repositories/products.repository";
import { importRepository } from "../repositories/import.repository";
import { logger } from "../lib/logger";
import { redisConnection } from "../lib/queue";
import { v4 as uuidv4 } from "uuid";

export interface ImportSummary {
  importFileId: number;
  jobId: string; // 🔥 Added jobId
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
}

const IMPORT_JOB_PREFIX = "import:job:";

export const importService = {
  async importFromCSV(
    buffer: Buffer,
    fileName: string,
    source: ImportSource = "keepa",
  ): Promise<ImportSummary> {
    const jobId = uuidv4();
    
    // Parse CSV
    const { valid, errors, totalRows } = parseKeepaCSV(buffer);

    logger.info(`CSV parse: ${totalRows} total rows, ${valid.length} valid, ${errors.length} errors`);

    // 🔥 Initialize progress in Redis
    const initialProgress: ImportProgress = {
      jobId,
      status: "processing",
      total: valid.length,
      processed: 0,
      startedAt: new Date().toISOString(),
    };
    await redisConnection.setex(
      `${IMPORT_JOB_PREFIX}${jobId}`,
      3600, // TTL: 1 hour
      JSON.stringify(initialProgress)
    );

    // Create ImportFile record before processing
    const importFile = await importRepository.create({
      file_name: fileName,
      source,
      file: buffer,
      total_rows: totalRows,
    });

    // Track upsert stats by checking which ASINs exist before upsert
    let insertedRows = 0;
    let updatedRows = 0;

    if (valid.length > 0) {
      const asins = valid.map((p) => p.asin);

      // Find already-existing ASINs
      const existingProducts = await productsRepository.findMany({
        page: 1,
        limit: asins.length,
        search: undefined,
      });
      const existingAsins = new Set(existingProducts.items.map((p) => p.asin));

      for (const asin of asins) {
        if (existingAsins.has(asin)) {
          updatedRows++;
        } else {
          insertedRows++;
        }
      }

      // Upsert in batches of 100 to avoid overwhelming DB
      const BATCH_SIZE = 100;
      for (let i = 0; i < valid.length; i += BATCH_SIZE) {
        const batch = valid.slice(i, i + BATCH_SIZE);
        await productsRepository.upsertMany(batch);
        
        // 🔥 Update progress in Redis after each batch
        const processed = Math.min(i + BATCH_SIZE, valid.length);
        await this.updateProgress(jobId, processed, valid.length);
        
        logger.info(`Upserted batch ${i / BATCH_SIZE + 1}, records ${i + 1}-${i + batch.length}`);
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

    // 🔥 Mark job as completed
    await this.markCompleted(jobId);

    return {
      importFileId: importFile.id,
      jobId, // 🔥 Return jobId
      inserted_rows: insertedRows,
      updated_rows: updatedRows,
      failed_rows: errors.length,
      total_rows: totalRows,
      errors,
      errorFilePath,
    };
  },

  // 🔥 New: Update progress
  async updateProgress(jobId: string, processed: number, total: number): Promise<void> {
    const key = `${IMPORT_JOB_PREFIX}${jobId}`;
    const raw = await redisConnection.get(key);
    if (!raw) return;

    const progress = JSON.parse(raw) as ImportProgress;
    progress.processed = processed;
    progress.status = "processing";

    await redisConnection.setex(key, 3600, JSON.stringify(progress));
  },

  // 🔥 New: Mark as completed
  async markCompleted(jobId: string): Promise<void> {
    const key = `${IMPORT_JOB_PREFIX}${jobId}`;
    const raw = await redisConnection.get(key);
    if (!raw) return;

    const progress = JSON.parse(raw) as ImportProgress;
    progress.status = "completed";
    progress.completedAt = new Date().toISOString();

    await redisConnection.setex(key, 3600, JSON.stringify(progress));
  },

  // 🔥 New: Get progress
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
        jobId: "", // Manual imports don't need jobId tracking
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