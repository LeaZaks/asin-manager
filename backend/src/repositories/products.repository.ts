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

    // Dynamic sort – only allow known Product fields to prevent injection
    const allowedSortFields = [
      "asin", "brand", "created_at", "updated_at",
      "sales_rank_current", "buybox_price", "rating",
    ];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : "created_at";

    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [safeSortBy]: sortOrder },
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
    const results = await prisma.$transaction(
      records.map((record) => {
        const data = normalizeProductData(record);
        return prisma.product.upsert({
          where: { asin: data.asin },
          create: data,
          update: data,
        });
      }),
    );
    return results;
  },

  /**
   * Bulk upsert using raw SQL INSERT ... ON CONFLICT for maximum performance.
   * Uses COALESCE to preserve existing values when new value is null.
   */
  async upsertManyBulk(records: UpsertProductData[]) {
    if (records.length === 0) return;

    const COLS = [
      'asin', 'sales_rank_current', 'sales_rank_avg_90d', 'sales_rank_drop_90d',
      'bought_past_month', 'rating', 'rating_count', 'rating_count_drop_90d',
      'buybox_price', 'buybox_price_avg_90d', 'buybox_price_drop_90d',
      'buybox_price_lowest', 'buybox_price_highest', 'buybox_stock',
      'amazon_share_180d', 'buybox_winner_count_90d', 'referral_fee',
      'offer_count_total', 'new_offer_count_current', 'new_offer_count_avg_90d',
      'category_root', 'category_sub', 'category_tree', 'brand',
      'release_date', 'package_dimension_cm3', 'package_weight_g',
      'package_quantity', 'is_hazmat', 'is_heat_sensitive', 'amazon_url',
      'updated_at',
    ] as const;

    const UPDATE_COLS = COLS.filter(c => c !== 'asin');

    const values: unknown[] = [];
    const rowPlaceholders: string[] = [];

    for (const record of records) {
      const data = normalizeProductData(record);
      const startIdx = values.length + 1;
      const placeholders = COLS.map((_, i) => `$${startIdx + i}`);
      rowPlaceholders.push(`(${placeholders.join(', ')})`);

      for (const col of COLS) {
        if (col === 'updated_at') {
          values.push(new Date());
        } else {
          values.push((data as Record<string, unknown>)[col] ?? null);
        }
      }
    }

    const colNames = COLS.map(c => `"${c}"`).join(', ');
    const updateSet = UPDATE_COLS
      .map(c => `"${c}" = COALESCE(EXCLUDED."${c}", products."${c}")`)
      .join(', ');

    const sql = `
      INSERT INTO products (${colNames})
      VALUES ${rowPlaceholders.join(', ')}
      ON CONFLICT (asin) DO UPDATE SET ${updateSet}
    `;

    await prisma.$executeRawUnsafe(sql, ...values);
  },

  async deleteMany(asins: string[]) {
    return prisma.product.deleteMany({
      where: { asin: { in: asins } },
    });
  },

  async findAsinsForProcessing(mode: "100" | "200" | "unchecked") {
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

    const limit = mode === "100" ? 100 : 200;
    return prisma.product.findMany({
      take: limit,
      orderBy: { created_at: "desc" },
      select: { asin: true },
    });
  },
};
