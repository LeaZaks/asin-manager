import { Router } from "express";
import { evaluationsController } from "../controllers/evaluations.controller";

const router = Router();

// PUT  /api/evaluations/:asin  (upsert)
router.put("/:asin", evaluationsController.upsertEvaluation);

// GET  /api/evaluations/:asin
router.get("/:asin", evaluationsController.getEvaluation);

export default router;
