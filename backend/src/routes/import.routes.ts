import { Router } from "express";
import multer from "multer";
import { importController } from "../controllers/import.controller";

const router = Router();

// Store file in memory (we save the buffer to DB/disk ourselves)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
});

// POST /api/import/csv
router.post("/csv", upload.single("file"), importController.uploadCSV);

// POST /api/import/manual
router.post("/manual", importController.addManual);

// GET /api/import/history
router.get("/history", importController.getHistory);

// GET /api/import/:id/errors
router.get("/:id/errors", importController.downloadErrors);

export default router;
