import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

export const evaluationsController = {
  async upsertEvaluation(req: Request, res: Response) {
    const { asin } = req.params;
    const { score, note } = req.body as { score?: number | null; note?: string };

    // score=null means "clear the evaluation"
    if (score === null) {
      await prisma.productEvaluation.deleteMany({
        where: { asin: asin.toUpperCase() },
      });
      res.json({ deleted: true, asin: asin.toUpperCase() });
      return;
    }

    if (score === undefined) throw new AppError(400, "score is required");
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new AppError(400, "score must be an integer between 1 and 5");
    }

    const evaluation = await prisma.productEvaluation.upsert({
      where: { asin: asin.toUpperCase() },
      create: {
        asin: asin.toUpperCase(),
        score,
        note: note ?? null,
      },
      update: {
        score,
        note: note ?? null,
      },
    });

    res.json(evaluation);
  },

  async getEvaluation(req: Request, res: Response) {
    const { asin } = req.params;
    const evaluation = await prisma.productEvaluation.findUnique({
      where: { asin: asin.toUpperCase() },
    });
    if (!evaluation) throw new AppError(404, `No evaluation for ASIN ${asin}`);
    res.json(evaluation);
  },
};
