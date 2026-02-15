import { Request, Response } from "express";
import { productsRepository } from "../repositories/products.repository";
import { AppError } from "../middleware/errorHandler";

export const productsController = {
  async list(req: Request, res: Response) {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const parsedLimit = parseInt(String(req.query.limit ?? "100"), 10);
    const limit = Number.isNaN(parsedLimit) ? 100 : Math.max(1, Math.min(500, parsedLimit));
    const result = await productsRepository.findMany({
      page,
      limit,
      search: req.query.search as string | undefined,
      brand: req.query.brand as string | undefined,
      status: req.query.status as string | undefined,
      checkedAt: req.query.checkedAt as "null" | "not_null" | undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortOrder: (req.query.sortOrder as "asc" | "desc" | undefined) ?? "desc",
    });

    res.json(result);
  },

  async getOne(req: Request, res: Response) {
    const { asin } = req.params;
    const product = await productsRepository.findByAsin(asin.toUpperCase());
    if (!product) throw new AppError(404, `ASIN ${asin} not found`);
    res.json(product);
  },

  async deleteMany(req: Request, res: Response) {
    const { asins } = req.body as { asins: string[] };
    if (!Array.isArray(asins) || asins.length === 0) {
      throw new AppError(400, "Body must contain non-empty asins array");
    }
    const result = await productsRepository.deleteMany(asins);
    res.json({ deleted: result.count });
  },
};
