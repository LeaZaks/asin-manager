import axios from "axios";
import type {
  PaginatedProducts,
  Product,
  ImportFile,
  ProcessingStatus,
  Tag,
  ProductEvaluation,
} from "../types";

const api = axios.create({ baseURL: "/api" });

// ── Products ──────────────────────────────────────────────────────────────────
export interface ProductListParams {
  page?: number;
  limit?: number;
  search?: string;
  brand?: string;
  status?: string;
  checkedAt?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export const productsApi = {
  list: (params: ProductListParams) =>
    api.get<PaginatedProducts>("/products", { params }).then((r) => r.data),

  getOne: (asin: string) =>
    api.get<Product>(`/products/${asin}`).then((r) => r.data),

  updateNotes: (asin: string, notes: string | null) =>
    api.patch<Product>(`/products/${asin}/notes`, { notes }).then((r) => r.data),


  deleteMany: (asins: string[]) =>
    api.delete<{ deleted: number }>("/products", { data: { asins } }).then((r) => r.data),
};

// ── Import ────────────────────────────────────────────────────────────────────
export const importApi = {
  uploadCSV: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ jobId: string; total: number }>("/import/csv", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },

  addManual: (asin: string) =>
    api.post<{ message: string; asin: string }>("/import/manual", { asin }).then((r) => r.data),

  getProgress: (jobId: string) =>
    api.get<{
      jobId: string;
      status: "processing" | "completed" | "failed";
      total: number;
      processed: number;
      summary?: {
        importFileId: number;
        total_rows: number;
        inserted_rows: number;
        updated_rows: number;
        failed_rows: number;
        hasErrors: boolean;
        errors: Array<{ row: number; reason: string }>;
      };
    }>(`/import/progress/${jobId}`).then((r) => r.data),

  getHistory: () =>
    api.get<ImportFile[]>("/import/history").then((r) => r.data),
};

// ── Processing ────────────────────────────────────────────────────────────────
export const processingApi = {
  start: (mode: "100" | "200" | "unchecked" | "gated") =>
    api.post<{ jobId: string; totalAsins: number }>("/processing/start", { mode }).then((r) => r.data),

  getActiveStatus: () =>
    api.get<ProcessingStatus>("/processing/status").then((r) => r.data),

  cancel: () =>
    api.post<{ message: string; jobId: string }>("/processing/cancel").then((r) => r.data),
};

// ── Tags ──────────────────────────────────────────────────────────────────────
export const tagsApi = {
  list: () =>
    api.get<Tag[]>("/tags").then((r) => r.data),

  create: (payload: { name: string; type: "warning" | "note"; color?: string }) =>
    api.post<Tag>("/tags", payload).then((r) => r.data),

  update: (id: number, payload: Partial<{ name: string; type: string; color: string }>) =>
    api.patch<Tag>(`/tags/${id}`, payload).then((r) => r.data),

  delete: (id: number) =>
    api.delete<{ deleted: boolean }>(`/tags/${id}`).then((r) => r.data),

  addToProduct: (asin: string, tag_id: number) =>
    api.post(`/tags/product/${asin}`, { tag_id }).then((r) => r.data),

  removeFromProduct: (asin: string, tagId: number) =>
    api.delete(`/tags/product/${asin}/${tagId}`).then((r) => r.data),
};

// ── Evaluations ───────────────────────────────────────────────────────────────
export const evaluationsApi = {
  upsert: (asin: string, score: number | null, note?: string) =>
    api.put<ProductEvaluation>(`/evaluations/${asin}`, { score, note }).then((r) => r.data),
};
