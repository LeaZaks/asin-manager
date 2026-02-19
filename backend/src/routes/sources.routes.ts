import { Router } from "express";
import { sourcesController } from "../controllers/sources.controller";

const router = Router({ mergeParams: true });

// GET    /api/sources  (all sources - mounted separately)
// GET    /api/products/:asin/sources
router.get("/", sourcesController.list);

// POST   /api/products/:asin/sources
router.post("/", sourcesController.create);

// PATCH  /api/products/:asin/sources/:id
router.patch("/:id", sourcesController.update);

// DELETE /api/products/:asin/sources/:id
router.delete("/:id", sourcesController.delete);

export default router;
