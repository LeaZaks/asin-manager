import { Request, Response } from "express";
import { sourcesRepository } from "../repositories/sources.repository";
import { AppError } from "../middleware/errorHandler";

export const sourcesController = {
  async list(req: Request, res: Response) {
    const { asin } = req.params;
    const sources = await sourcesRepository.findByAsin(asin.toUpperCase());
    res.json(sources);
  },

  async listAll(_req: Request, res: Response) {
    const sources = await sourcesRepository.findAll();
    res.json(sources);
  },

  async create(req: Request, res: Response) {
    const { asin } = req.params;
    const { supplier_name, url, purchase_price, notes } = req.body as {
      supplier_name?: string;
      url?: string | null;
      purchase_price?: number | null;
      notes?: string | null;
    };

    if (!supplier_name || !supplier_name.trim()) {
      throw new AppError(400, "supplier_name is required");
    }

    const source = await sourcesRepository.create(asin.toUpperCase(), {
      supplier_name: supplier_name.trim(),
      url: url?.trim() || null,
      purchase_price: purchase_price ?? null,
      notes: notes?.trim() || null,
    });

    res.status(201).json(source);
  },

  async update(req: Request, res: Response) {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError(400, "Invalid source id");

    const { supplier_name, url, purchase_price, notes } = req.body as {
      supplier_name?: string;
      url?: string | null;
      purchase_price?: number | null;
      notes?: string | null;
    };

    if (supplier_name !== undefined && !supplier_name.trim()) {
      throw new AppError(400, "supplier_name cannot be empty");
    }

    try {
      const source = await sourcesRepository.update(id, {
        ...(supplier_name !== undefined && { supplier_name: supplier_name.trim() }),
        ...(url !== undefined && { url: url?.trim() || null }),
        ...(purchase_price !== undefined && { purchase_price }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
      });
      res.json(source);
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") {
        throw new AppError(404, `Source ${id} not found`);
      }
      throw err;
    }
  },

  async delete(req: Request, res: Response) {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError(400, "Invalid source id");

    try {
      await sourcesRepository.delete(id);
      res.json({ deleted: true });
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") {
        throw new AppError(404, `Source ${id} not found`);
      }
      throw err;
    }
  },
};
