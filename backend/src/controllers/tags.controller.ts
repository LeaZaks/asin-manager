import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

export const tagsController = {
  // ── Tag CRUD ──────────────────────────────────────────────────────────────

  async listTags(_req: Request, res: Response) {
    const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
    res.json(tags);
  },

  async createTag(req: Request, res: Response) {
    const { name, type, color } = req.body as {
      name?: string;
      type?: string;
      color?: string;
    };
    if (!name?.trim()) throw new AppError(400, "name is required");
    if (type !== "warning" && type !== "note") {
      throw new AppError(400, 'type must be "warning" or "note"');
    }

    const tag = await prisma.tag.create({
      data: { name: name.trim(), type, color: color ?? null },
    });
    res.status(201).json(tag);
  },

  async updateTag(req: Request, res: Response) {
    const id = parseInt(req.params.id, 10);
    const { name, type, color } = req.body as {
      name?: string;
      type?: string;
      color?: string;
    };

    const tag = await prisma.tag.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(type && { type: type as "warning" | "note" }),
        ...(color !== undefined && { color }),
      },
    });
    res.json(tag);
  },

  async deleteTag(req: Request, res: Response) {
    const id = parseInt(req.params.id, 10);

    // Check if tag is in use
    const usageCount = await prisma.productTag.count({ where: { tag_id: id } });
    if (usageCount > 0) {
      throw new AppError(409, `Tag is in use by ${usageCount} products. Remove from products first.`);
    }

    await prisma.tag.delete({ where: { id } });
    res.json({ deleted: true });
  },

  // ── Product ↔ Tag association ─────────────────────────────────────────────

  async addTagToProduct(req: Request, res: Response) {
    const { asin } = req.params;
    const { tag_id } = req.body as { tag_id?: number };

    if (!tag_id) throw new AppError(400, "tag_id is required");

    const productTag = await prisma.productTag.upsert({
      where: { asin_tag_id: { asin: asin.toUpperCase(), tag_id } },
      create: { asin: asin.toUpperCase(), tag_id },
      update: {},
    });
    res.status(201).json(productTag);
  },

  async removeTagFromProduct(req: Request, res: Response) {
    const { asin, tagId } = req.params;

    await prisma.productTag.delete({
      where: {
        asin_tag_id: { asin: asin.toUpperCase(), tag_id: parseInt(tagId, 10) },
      },
    });
    res.json({ removed: true });
  },
};
