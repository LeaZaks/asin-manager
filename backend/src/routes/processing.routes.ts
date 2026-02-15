import { Router } from "express";
import { processingController } from "../controllers/processing.controller";

const router = Router();

// POST /api/processing/start
router.post("/start", processingController.startJob);

// POST /api/processing/cancel
router.post("/cancel", processingController.cancelJob);

// GET /api/processing/status  (active job)
router.get("/status", processingController.getActiveStatus);

// GET /api/processing/status/:jobId
router.get("/status/:jobId", processingController.getJobStatus);

export default router;
