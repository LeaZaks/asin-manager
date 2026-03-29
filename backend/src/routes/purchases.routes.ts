// routes/purchases.routes.ts
import { Router } from "express";
import multer from "multer";
import path from "path";
import { purchasesController, creditCardsController } from "../controllers/purchases.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

const router = Router();

// ── Purchases ─────────────────────────────────────────────────────────────────
router.get("/", purchasesController.list);
router.get("/:id", purchasesController.getOne);
router.post("/", upload.single("receipt"), purchasesController.create);
router.patch("/:id", upload.single("receipt"), purchasesController.update);
router.delete("/:id", purchasesController.delete);

export default router;

// ── Credit Cards (separate file) ──────────────────────────────────────────────
export { creditCardsController };