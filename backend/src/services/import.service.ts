import path from "path";
import fs from "fs/promises";
import { ImportSource } from "@prisma/client";
import { parseKeepaCSV } from "../lib/keepaCsvParser";
import { productsRepository } from "../repositories/products.repository";
import { importRepository } from "../repositories/import.repository";
import { logger } from "../lib/logger";

export interface ImportSummary {
  importFileId: number;
  inserted_rows: number;
  updated_rows: number;
  failed_rows: number;
  total_rows: number;
  errors: Array<{ row: number; reason: string; rawData?: string }>;
  errorFilePath?: string;
}

export const importService = {
  async importFromCSV(
    buffer: Buffer,
    fileName: string,
    source: ImportSource = "keepa",
  ): Promise<ImportSummary> {
    // Parse CSV
    const { valid, errors, totalRows } = parseKeepaCSV(buffer);

    logger.info(`CSV parse: ${totalRows} total rows, ${valid.length} valid, ${errors.length} errors`);

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

    return {
      importFileId: importFile.id,
      inserted_rows: insertedRows,
      updated_rows: updatedRows,
      failed_rows: errors.length,
      total_rows: totalRows,
      errors,
      errorFilePath,
    };
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
