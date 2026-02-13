import { Request, Response } from "express";
import { importService } from "../services/import.service";
import { AppError } from "../middleware/errorHandler";

export const importController = {
  async uploadCSV(req: Request, res: Response) {
    if (!req.file) {
      throw new AppError(400, "No file uploaded. Expected multipart/form-data with field 'file'");
    }
    if (!req.file.originalname.endsWith(".csv")) {
      throw new AppError(400, "File must be a .csv");
    }

    const summary = await importService.importFromCSV(
      req.file.buffer,
      req.file.originalname,
      "keepa",
    );

    res.json({
      message: "Import completed",
      summary: {
        importFileId: summary.importFileId,
        total_rows: summary.total_rows,
        inserted_rows: summary.inserted_rows,
        updated_rows: summary.updated_rows,
        failed_rows: summary.failed_rows,
        hasErrors: summary.errors.length > 0,
        errors: summary.errors.slice(0, 50), // Return first 50 errors in response
      },
    });
  },

  async addManual(req: Request, res: Response) {
    const { asin } = req.body as { asin?: string };
    if (!asin) throw new AppError(400, "asin is required");

    const summary = await importService.importManualAsin(asin);
    res.json({
      message: "ASIN added",
      asin: asin.trim().toUpperCase(),
      summary,
    });
  },

  async getHistory(_req: Request, res: Response) {
    const history = await importService.getHistory();
    res.json(history);
  },

  async downloadErrors(req: Request, res: Response) {
    const id = parseInt(req.params.id, 10);
    const { prisma } = await import("../lib/prisma");
    const importFile = await prisma.importFile.findUnique({ where: { id } });

    if (!importFile) throw new AppError(404, "Import file not found");
    if (!importFile.error_file_path) throw new AppError(404, "No error file for this import");

    res.download(importFile.error_file_path);
  },
};
