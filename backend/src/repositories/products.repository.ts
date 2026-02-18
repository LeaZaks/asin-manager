import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ProductListParams {
  page: number;
  limit: number;
  search?: string;
  brand?: string;
  status?: string;
  checkedAt?: "null" | "not_null";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export type UpsertProductData = Omit<
  Prisma.ProductCreateInput,
  "sellerStatus" | "evaluation" | "productTags"
>;


function buildAmazonUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}?psc=1`;
}

function normalizeProductData(data: UpsertProductData): UpsertProductData {
  return {
    ...data,
    amazon_url: data.amazon_url?.trim() || buildAmazonUrl(data.asin),
  };
}

// Column names for bulk upsert (must match DB columns exactly)
const UPSERT_COLUMNS = [
  "asin", "sales_rank_current", "sales_rank_avg_90d", "sales_rank_drop_90d",
  "bought_past_month", "rating", "rating_count", "rating_count_drop_90d",
  "buybox_price", "buybox_price_avg_90d", "buybox_price_drop_90d",
  "buybox_price_lowest", "buybox_price_highest", "buybox_stock",
  "amazon_share_180d", "buybox_winner_count_90d", "referral_fee",
  "offer_count_total", "new_offer_count_current", "new_offer_count_avg_90d",
  "category_root", "category_sub", "category_tree", "brand", "release_date",
  "package_dimension_cm3", "package_weight_g", "package_quantity",
  "is_hazmat", "is_heat_sensitive", "amazon_url", "image_url",
] as const;

const UPDATE_SET = UPSERT_COLUMNS
  .filter((c) => c !== "asin")
  .map((c) => `${c} = EXCLUDED.${c}`)
  .join(", ");

// ── Repository ────────────────────────────────────────────────────────────────
export const productsRepository = {
  async findMany(params: ProductListParams) {
    const { page, limit, search, brand, status, checkedAt, sortBy = "created_at", sortOrder = "desc" } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      AND: [
        search
          ? {
              OR: [
                { asin: { contains: search, mode: "insensitive" } },
                { brand: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        brand ? { brand: { contains: brand, mode: "insensitive" } } : {},
        status
          ? { sellerStatus: { status: status as Prisma.EnumSellerStatusEnumFilter["equals"] } }
          : {},
        checkedAt === "null"
          ? { sellerStatus: { checked_at: null } }
          : checkedAt === "not_null"
          ? { sellerStatus: { checked_at: { not: null } } }
          : {},
      ],
    };

    // Dynamic sort – only allow known fields to prevent injection
    const allowedProductFields = [
      "asin", "brand", "created_at", "updated_at",
      "sales_rank_current", "buybox_price", "rating",
    ];
    const allowedRelationFields = ["seller_status", "checked_at"];
    const isRelationSort = allowedRelationFields.includes(sortBy);
    const safeSortBy = allowedProductFields.includes(sortBy) ? sortBy : (!isRelationSort ? "created_at" : sortBy);

    // Build orderBy: relation fields use nested syntax
    let orderBy: Prisma.ProductOrderByWithRelationInput;
    if (safeSortBy === "seller_status") {
      orderBy = { sellerStatus: { status: sortOrder } };
    } else if (safeSortBy === "checked_at") {
      orderBy = { sellerStatus: { checked_at: sortOrder } };
    } else {
      orderBy = { [safeSortBy]: sortOrder };
    }

    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          sellerStatus: true,
          evaluation: true,
          productTags: { include: { tag: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  async findByAsin(asin: string) {
    return prisma.product.findUnique({
      where: { asin },
      include: {
        sellerStatus: true,
        evaluation: true,
        productTags: { include: { tag: true } },
      },
    });
  },

  async upsertMany(records: UpsertProductData[]) {
    if (records.length === 0) return;

    const normalized = records.map(normalizeProductData);
    const colCount = UPSERT_COLUMNS.length;
    const values: unknown[] = [];

    const rowPlaceholders = normalized.map((record, rowIdx) => {
      const params = UPSERT_COLUMNS.map((col, colIdx) => {
        values.push((record as Record<string, unknown>)[col] ?? null);
        return `$${rowIdx * colCount + colIdx + 1}`;
      });
      return `(${params.join(", ")}, NOW(), NOW())`;
    });

    const sql = `
      INSERT INTO products (${UPSERT_COLUMNS.join(", ")}, created_at, updated_at)
      VALUES ${rowPlaceholders.join(", ")}
      ON CONFLICT (asin) DO UPDATE SET ${UPDATE_SET}, updated_at = NOW()
    `;

    await prisma.$executeRawUnsafe(sql, ...values);
  },

  async deleteMany(asins: string[]) {
    return prisma.product.deleteMany({
      where: { asin: { in: asins } },
    });
  },


  async updateNotes(asin: string, notes: string | null) {
    try {
      return await prisma.product.update({
        where: { asin },
        data: { notes },
        include: {
          sellerStatus: true,
          evaluation: true,
          productTags: { include: { tag: true } },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new AppError(404, `ASIN ${asin} not found`);
      }
      throw error;
    }
  },

  async findAsinsForProcessing(mode: "100" | "200" | "unchecked" | "gated") {
    if (mode === "unchecked") {
      return prisma.product.findMany({
        where: {
          OR: [
            { sellerStatus: null },
            { sellerStatus: { checked_at: null } },
          ],
        },
        select: { asin: true },
      });
    }

    if (mode === "gated") {
      return prisma.product.findMany({
        where: {
          sellerStatus: { status: "gated" },
        },
        select: { asin: true },
      });
    }

    const limit = mode === "100" ? 100 : 200;
    return prisma.product.findMany({
      take: limit,
      orderBy: { created_at: "desc" },
      select: { asin: true },
    });
  },
};
