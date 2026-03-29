// api/purchases.ts  –  add this to your existing index.ts or import separately

import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export interface Purchase {
  id: number;
  asin: string;
  source_url: string | null;
  order_number: string | null;
  order_date: string | null;
  quantity: number | null;
  total_amount: string | null;
  tax_amount: string | null;
  shipping_cost: string | null;
  delivery_date: string | null;
  receipt_file: string | null;
  credit_card_id: number | null;
  coupons_used: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product: {
    image_url: string | null;
    brand: string | null;
    amazon_url: string | null;
  };
  creditCard: {
    last4: string;
    nickname: string;
  } | null;
}

export interface PaginatedPurchases {
  total: number;
  page: number;
  limit: number;
  items: Purchase[];
}

export interface CreditCard {
  id: number;
  last4: string;
  nickname: string;
  created_at: string;
}

export interface PurchaseListParams {
  page?: number;
  limit?: number;
  search?: string;
  asin?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ── Purchases API ─────────────────────────────────────────────────────────────
export const purchasesApi = {
  list: (params: PurchaseListParams) =>
    api.get<PaginatedPurchases>("/purchases", { params }).then((r) => r.data),

  getOne: (id: number) =>
    api.get<Purchase>(`/purchases/${id}`).then((r) => r.data),

  create: (formData: FormData) =>
    api.post<Purchase>("/purchases", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data),

  update: (id: number, formData: FormData) =>
    api.patch<Purchase>(`/purchases/${id}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data),

  delete: (id: number) =>
    api.delete<{ deleted: boolean }>(`/purchases/${id}`).then((r) => r.data),
};

// ── Credit Cards API ──────────────────────────────────────────────────────────
export const creditCardsApi = {
  list: () =>
    api.get<CreditCard[]>("/credit-cards").then((r) => r.data),

  create: (payload: { last4: string; nickname: string }) =>
    api.post<CreditCard>("/credit-cards", payload).then((r) => r.data),

  update: (id: number, payload: Partial<{ last4: string; nickname: string }>) =>
    api.patch<CreditCard>(`/credit-cards/${id}`, payload).then((r) => r.data),

  delete: (id: number) =>
    api.delete<{ deleted: boolean }>(`/credit-cards/${id}`).then((r) => r.data),
};
