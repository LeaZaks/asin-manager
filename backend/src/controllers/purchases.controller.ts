// controllers/purchases.controller.ts
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function uploadReceiptToStorage(file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname);
  const fileName = `${uuidv4()}${ext}`;

  const { error } = await supabase.storage
    .from("receipts")
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from("receipts").getPublicUrl(fileName);
  return data.publicUrl;
}

// ── List purchases (paginated, filterable, sortable) ──────────────────────────
export const purchasesController = {
  list: async (req: Request, res: Response) => {
    const {
      page = "1",
      limit = "50",
      search,
      asin,
      sortBy = "order_date",
      sortOrder = "desc",
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: Record<string, unknown> = {};
    if (asin) where.asin = asin;
    if (search) {
      where.OR = [
        { asin: { contains: search, mode: "insensitive" } },
        { order_number: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    const allowedSortFields = [
      "order_date", "delivery_date", "total_amount", "quantity",
      "asin", "created_at", "order_number",
    ];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : "order_date";
    const orderDir = sortOrder === "asc" ? "asc" : "desc";

    const [total, items] = await Promise.all([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where,
        skip,
        take,
        orderBy: { [orderField]: orderDir },
        include: {
          product: {
            select: { image_url: true, brand: true, amazon_url: true },
          },
          creditCard: {
            select: { last4: true, nickname: true },
          },
        },
      }),
    ]);

    res.json({
      total,
      page: parseInt(page),
      limit: take,
      items,
    });
  },

  getOne: async (req: Request, res: Response) => {
    const { id } = req.params;
    const purchase = await prisma.purchase.findUniqueOrThrow({
      where: { id: parseInt(id) },
      include: {
        product: { select: { image_url: true, brand: true, amazon_url: true } },
        creditCard: true,
      },
    });
    res.json(purchase);
  },

  create: async (req: Request, res: Response) => {
    const {
      asin, source_url, order_number, order_date, quantity,
      total_amount, tax_amount, shipping_cost, delivery_date,
      credit_card_id, coupons_used, notes,
    } = req.body;

    const multerFile = (req as Request & { file?: Express.Multer.File }).file;
    const receipt_file = multerFile ? await uploadReceiptToStorage(multerFile) : undefined;

    const purchase = await prisma.purchase.create({
      data: {
        asin,
        source_url: source_url || null,
        order_number: order_number || null,
        order_date: order_date ? new Date(order_date) : null,
        quantity: quantity ? parseInt(quantity) : null,
        total_amount: total_amount ? parseFloat(total_amount) : null,
        tax_amount: tax_amount ? parseFloat(tax_amount) : null,
        shipping_cost: shipping_cost ? parseFloat(shipping_cost) : null,
        delivery_date: delivery_date ? new Date(delivery_date) : null,
        receipt_file: receipt_file || null,
        credit_card_id: credit_card_id ? parseInt(credit_card_id) : null,
        coupons_used: coupons_used || null,
        notes: notes || null,
      },
      include: {
        product: { select: { image_url: true, brand: true, amazon_url: true } },
        creditCard: true,
      },
    });

    res.status(201).json(purchase);
  },

  update: async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      source_url, order_number, order_date, quantity,
      total_amount, tax_amount, shipping_cost, delivery_date,
      credit_card_id, coupons_used, notes,
    } = req.body;

    const multerFile = (req as Request & { file?: Express.Multer.File }).file;
    const receipt_file = multerFile ? await uploadReceiptToStorage(multerFile) : undefined;

    const data: Record<string, unknown> = {};
    if (source_url !== undefined) data.source_url = source_url || null;
    if (order_number !== undefined) data.order_number = order_number || null;
    if (order_date !== undefined) data.order_date = order_date ? new Date(order_date) : null;
    if (quantity !== undefined) data.quantity = quantity ? parseInt(quantity) : null;
    if (total_amount !== undefined) data.total_amount = total_amount ? parseFloat(total_amount) : null;
    if (tax_amount !== undefined) data.tax_amount = tax_amount ? parseFloat(tax_amount) : null;
    if (shipping_cost !== undefined) data.shipping_cost = shipping_cost ? parseFloat(shipping_cost) : null;
    if (delivery_date !== undefined) data.delivery_date = delivery_date ? new Date(delivery_date) : null;
    if (receipt_file) data.receipt_file = receipt_file;
    if (credit_card_id !== undefined) data.credit_card_id = credit_card_id ? parseInt(credit_card_id) : null;
    if (coupons_used !== undefined) data.coupons_used = coupons_used || null;
    if (notes !== undefined) data.notes = notes || null;

    const purchase = await prisma.purchase.update({
      where: { id: parseInt(id) },
      data,
      include: {
        product: { select: { image_url: true, brand: true, amazon_url: true } },
        creditCard: true,
      },
    });

    res.json(purchase);
  },

  delete: async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.purchase.delete({ where: { id: parseInt(id) } });
    res.json({ deleted: true });
  },
};

// ── Credit Cards ──────────────────────────────────────────────────────────────
export const creditCardsController = {
  list: async (_req: Request, res: Response) => {
    const cards = await prisma.creditCard.findMany({ orderBy: { nickname: "asc" } });
    res.json(cards);
  },

  create: async (req: Request, res: Response) => {
    const { last4, nickname } = req.body;
    const card = await prisma.creditCard.create({ data: { last4, nickname } });
    res.status(201).json(card);
  },

  update: async (req: Request, res: Response) => {
    const { id } = req.params;
    const { last4, nickname } = req.body;
    const card = await prisma.creditCard.update({
      where: { id: parseInt(id) },
      data: { last4, nickname },
    });
    res.json(card);
  },

  delete: async (req: Request, res: Response) => {
    const { id } = req.params;
    await prisma.creditCard.delete({ where: { id: parseInt(id) } });
    res.json({ deleted: true });
  },
};