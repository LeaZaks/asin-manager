import { Router } from "express";
import { tagsController } from "../controllers/tags.controller";

const router = Router();

// ── Tag management ────────────────────────────────────────────────────────────
// GET    /api/tags
router.get("/", tagsController.listTags);
// POST   /api/tags
router.post("/", tagsController.createTag);
// PATCH  /api/tags/:id
router.patch("/:id", tagsController.updateTag);
// DELETE /api/tags/:id
router.delete("/:id", tagsController.deleteTag);

// ── Product ↔ Tag ─────────────────────────────────────────────────────────────
// POST   /api/tags/product/:asin
router.post("/product/:asin", tagsController.addTagToProduct);
// DELETE /api/tags/product/:asin/:tagId
router.delete("/product/:asin/:tagId", tagsController.removeTagFromProduct);

export default router;
