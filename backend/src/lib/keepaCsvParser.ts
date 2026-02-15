import Papa from "papaparse";
import { UpsertProductData } from "../repositories/products.repository";

// Maps Keepa CSV header names → Product DB field names
const KEEPA_FIELD_MAP: Record<string, keyof UpsertProductData> = {
  "ASIN": "asin",
  "Sales Rank: Current": "sales_rank_current",
  "Sales Rank: 90 days avg.": "sales_rank_avg_90d",
  "Sales Rank: 90 days drop %": "sales_rank_drop_90d",
  "Bought in past month": "bought_past_month",
  "Reviews: Rating": "rating",
  "Reviews: Rating Count": "rating_count",
  "Reviews: Rating Count - 90 days drop %": "rating_count_drop_90d",
  "Buy Box: Current": "buybox_price",
  "Buy Box: 90 days avg.": "buybox_price_avg_90d",
  "Buy Box: 90 days drop %": "buybox_price_drop_90d",
  "Buy Box: Lowest": "buybox_price_lowest",
  "Buy Box: Highest": "buybox_price_highest",
  "Buy Box: Stock": "buybox_stock",
  "Buy Box: % Amazon 180 days": "amazon_share_180d",
  "Buy Box: Winner Count 90 days": "buybox_winner_count_90d",
  "Referral Fee based on current Buy Box price": "referral_fee",
  "Total Offer Count": "offer_count_total",
  "New Offer Count: Current": "new_offer_count_current",
  "New Offer Count: 90 days avg.": "new_offer_count_avg_90d",
  "Categories: Root": "category_root",
  "Categories: Sub": "category_sub",
  "Categories: Tree": "category_tree",
  "Brand": "brand",
  "Release Date": "release_date",
  "Package: Dimension (cm³)": "package_dimension_cm3",
  "Package: Weight (g)": "package_weight_g",
  "Package: Quantity": "package_quantity",
  "Is HazMat": "is_hazmat",
  "Is heat sensitive": "is_heat_sensitive",
  "URL: Amazon": "amazon_url",
};

export interface ParseResult {
  valid: UpsertProductData[];
  errors: Array<{ row: number; reason: string; rawData?: string }>;
  totalRows: number;
}

function parseValue(
  field: keyof UpsertProductData,
  raw: string,
): string | number | boolean | null {
  if (raw === "" || raw === "N/A" || raw === "-") return null;

  const numericFields: Array<keyof UpsertProductData> = [
    "sales_rank_current", "sales_rank_avg_90d", "sales_rank_drop_90d",
    "bought_past_month", "rating", "rating_count", "rating_count_drop_90d",
    "buybox_price", "buybox_price_avg_90d", "buybox_price_drop_90d",
    "buybox_price_lowest", "buybox_price_highest", "buybox_stock",
    "amazon_share_180d", "buybox_winner_count_90d", "referral_fee",
    "offer_count_total", "new_offer_count_current", "new_offer_count_avg_90d",
    "package_dimension_cm3", "package_weight_g", "package_quantity",
  ];

  const booleanFields: Array<keyof UpsertProductData> = ["is_hazmat", "is_heat_sensitive"];

  if (booleanFields.includes(field)) {
    return raw.toLowerCase() === "yes" || raw.toLowerCase() === "true" || raw === "1";
  }

  if (numericFields.includes(field)) {
    const cleaned = raw.replace(/[,%$]/g, "").trim();
    const num = Number(cleaned);
    return isNaN(num) ? null : num;
  }

  return raw.trim();
}

export function parseKeepaCSV(csvBuffer: Buffer): ParseResult {
  const csvText = csvBuffer.toString("utf-8");

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const valid: UpsertProductData[] = [];
  const errors: ParseResult["errors"] = [];
  const totalRows = parsed.data.length;

  parsed.data.forEach((row, index) => {
    const rowNumber = index + 2; // 1-indexed + header row

    // ASIN is mandatory
    const rawAsin = row["ASIN"] ?? "";
    if (!rawAsin.trim()) {
      errors.push({ row: rowNumber, reason: "Missing ASIN", rawData: JSON.stringify(row) });
      return;
    }

    // Build product record from known Keepa fields only
    const product: Partial<UpsertProductData> = {};

    for (const [keepaHeader, dbField] of Object.entries(KEEPA_FIELD_MAP)) {
      if (keepaHeader in row) {
        const parsed = parseValue(dbField, row[keepaHeader] ?? "");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (product as any)[dbField] = parsed;
      }
    }

    if (!product.asin) {
      errors.push({ row: rowNumber, reason: "Missing ASIN", rawData: JSON.stringify(row) });
      return;
    }

    valid.push(product as UpsertProductData);
  });

  return { valid, errors, totalRows };
}
