import { prisma } from "../lib/prisma";

export interface CreateSourceData {
  supplier_name: string;
  url?: string | null;
  purchase_price?: number | null;
  notes?: string | null;
}

export interface UpdateSourceData extends Partial<CreateSourceData> {}

export const sourcesRepository = {
  findByAsin(asin: string) {
    return prisma.productSource.findMany({
      where: { asin },
      orderBy: { created_at: "desc" },
    });
  },

  create(asin: string, data: CreateSourceData) {
    return prisma.productSource.create({
      data: {
        asin,
        supplier_name: data.supplier_name,
        url: data.url ?? null,
        purchase_price: data.purchase_price ?? null,
        notes: data.notes ?? null,
      },
    });
  },

  update(id: number, data: UpdateSourceData) {
    return prisma.productSource.update({
      where: { id },
      data: {
        ...(data.supplier_name !== undefined && { supplier_name: data.supplier_name }),
        ...(data.url !== undefined && { url: data.url }),
        ...(data.purchase_price !== undefined && { purchase_price: data.purchase_price }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
  },

  delete(id: number) {
    return prisma.productSource.delete({ where: { id } });
  },

  findAll() {
    return prisma.productSource.findMany({
      orderBy: { created_at: "desc" },
      include: {
        product: {
          select: { asin: true, image_url: true, brand: true },
        },
      },
    });
  },
};
