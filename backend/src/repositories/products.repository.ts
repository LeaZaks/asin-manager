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
    const allowedRelationFields = ["seller_status", "checked_at", "score"];
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

    // Score sort: use raw SQL to guarantee nulls always last across all pages
    if (safeSortBy === "score") {
      const dir = sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;

      // Build WHERE clause conditions
      const conditions: Prisma.Sql[] = [];
      if (search) {
        conditions.push(Prisma.sql`(p.asin ILIKE ${"%" + search + "%"} OR p.brand ILIKE ${"%" + search + "%"})`);
      }
      if (brand) {
        conditions.push(Prisma.sql`p.brand ILIKE ${"%" + brand + "%"}`);
      }
      if (status) {
        conditions.push(Prisma.sql`ss.status = ${status}`);
      }
      if (checkedAt === "null") {
        conditions.push(Prisma.sql`ss.checked_at IS NULL`);
      } else if (checkedAt === "not_null") {
        conditions.push(Prisma.sql`ss.checked_at IS NOT NULL`);
      }

      const whereClause = conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
        : Prisma.sql``;

      const [countResult, asinRows] = await prisma.$transaction([
        prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*) as count
          FROM products p
          LEFT JOIN seller_status ss ON ss.asin = p.asin
          LEFT JOIN product_evaluations e ON e.asin = p.asin
          ${whereClause}
        `,
        prisma.$queryRaw<{ asin: string }[]>`
          SELECT p.asin
          FROM products p
          LEFT JOIN seller_status ss ON ss.asin = p.asin
          LEFT JOIN product_evaluations e ON e.asin = p.asin
          ${whereClause}
          ORDER BY e.score ${dir} NULLS LAST
          LIMIT ${limit} OFFSET ${skip}
        `,
      ]);

      const total = Number(countResult[0].count);
      const asins = asinRows.map((r) => r.asin);

      // Fetch full product data for these ASINs, preserving order
      const rawItems = await prisma.product.findMany({
        where: { asin: { in: asins } },
        include: {
          sellerStatus: true,
          evaluation: true,
          productTags: { include: { tag: true } },
        },
      });

      // Restore the SQL-sorted order
      const asinIndex = new Map(asins.map((asin, i) => [asin, i]));
      const items = rawItems.sort((a, b) => (asinIndex.get(a.asin) ?? 0) - (asinIndex.get(b.asin) ?? 0));

      return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
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


  async updateNotes(asin: string, notes: string | null) {
    return prisma.product.update({
      where: { asin },
      data: { notes },
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