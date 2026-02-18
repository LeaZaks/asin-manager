// ─────────────────────────────────────────────────────────────────────────────
// Shared TypeScript types – mirrors the Prisma schema / API responses
// ─────────────────────────────────────────────────────────────────────────────

export type SellerStatusEnum =
  | "allowed"
  | "gated"
  | "requires_invoice"
  | "restricted"
  | "unknown";

export interface SellerStatus {
  asin: string;
  status: SellerStatusEnum;
  checked_at: string | null;
}

export interface Tag {
  id: number;
  name: string;
  type: "warning" | "note";
  color: string | null;
  created_at: string;
}

export interface ProductTag {
  id: number;
  asin: string;
  tag_id: number;
  created_at: string;
  tag: Tag;
}

export interface ProductEvaluation {
  asin: string;
  score: number; // 1-5
  note: string | null;
  updated_at: string;
}

export interface Product {
  asin: string;
  sales_rank_current: number | null;
  sales_rank_avg_90d: number | null;
  sales_rank_drop_90d: number | null;
  bought_past_month: number | null;
  rating: number | null;
  rating_count: number | null;
  rating_count_drop_90d: number | null;
  buybox_price: number | null;
  buybox_price_avg_90d: number | null;
  buybox_price_drop_90d: number | null;
  buybox_price_lowest: number | null;
  buybox_price_highest: number | null;
  buybox_stock: number | null;
  amazon_share_180d: number | null;
  buybox_winner_count_90d: number | null;
  referral_fee: number | null;
  offer_count_total: number | null;
  new_offer_count_current: number | null;
  new_offer_count_avg_90d: number | null;
  category_root: string | null;
  category_sub: string | null;
  category_tree: string | null;
  brand: string | null;
  release_date: string | null;
  package_dimension_cm3: number | null;
  package_weight_g: number | null;
  package_quantity: number | null;
  is_hazmat: boolean | null;
  is_heat_sensitive: boolean | null;
  amazon_url: string | null;
  image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sellerStatus: SellerStatus | null;
  evaluation: ProductEvaluation | null;
  productTags: ProductTag[];
}

export interface PaginatedProducts {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ImportFile {
  id: number;
  file_name: string;
  source: "keepa" | "manual";
  uploaded_at: string;
  total_rows: number;
  inserted_rows: number;
  updated_rows: number;
  failed_rows: number;
  error_file_path: string | null;
}

export interface ProcessingStatus {
  jobId: string;
  status: "running" | "completed" | "failed" | "idle";
  total: number;
  processed: number;
  percentage: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  summary?: {  // 🔥 הוסף זה!
    allowed: number;
    gated: number;
    restricted: number;
    unknown: number;
  };
}
