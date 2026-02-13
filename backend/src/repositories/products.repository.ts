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
      records.map((data) =>
        prisma.product.upsert({
          where: { asin: data.asin },
          create: data,
          update: data,
        }),
      ),
    );
    return results;
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
