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

    // Start import in background and return jobId immediately
    const { jobId, totalValid } = await importService.startCSVImport(
      req.file.buffer,
      req.file.originalname,
      "keepa",
    );

    res.json({ jobId, total: totalValid });
  },

  // 🔥 New: Get import progress
  async getProgress(req: Request, res: Response) {
    const { jobId } = req.params;
    const progress = await importService.getProgress(jobId);
    
    if (!progress) {
      throw new AppError(404, "Import job not found");
    }

    res.json(progress);
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