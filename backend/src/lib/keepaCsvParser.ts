import Papa from "papaparse";
import { UpsertProductData } from "../repositories/products.repository";

// Maps Keepa CSV header names → Product DB field names
// Multiple header variants are supported (Keepa exports vary between versions)
const KEEPA_FIELD_MAP: Record<string, keyof UpsertProductData> = {
  "ASIN": "asin",

  // Sales Rank
  "Sales Rank: Current": "sales_rank_current",
  "Sales Rank: 90 days avg.": "sales_rank_avg_90d",
  "Sales Rank: 90 days drop %": "sales_rank_drop_90d",

  // Purchased / bought
  "Bought in past month": "bought_past_month",

  // Reviews
  "Reviews: Rating": "rating",
  "Reviews: Rating Count": "rating_count",
  "Reviews: Rating Count - 90 days drop %": "rating_count_drop_90d",

  // Buy Box — original format
  "Buy Box: Current": "buybox_price",
  "Buy Box: 90 days avg.": "buybox_price_avg_90d",
  "Buy Box: 90 days drop %": "buybox_price_drop_90d",
  "Buy Box: Lowest": "buybox_price_lowest",
  "Buy Box: Highest": "buybox_price_highest",
  "Buy Box: Stock": "buybox_stock",
  "Buy Box: % Amazon 180 days": "amazon_share_180d",
  "Buy Box: Winner Count 90 days": "buybox_winner_count_90d",

  // Buy Box — Keepa format with truck emoji 🚚
  "Buy Box 🚚: Current": "buybox_price",
  "Buy Box 🚚: 90 days avg.": "buybox_price_avg_90d",
  "Buy Box 🚚: 90 days drop %": "buybox_price_drop_90d",
  "Buy Box 🚚: Lowest": "buybox_price_lowest",
  "Buy Box 🚚: Highest": "buybox_price_highest",
  "Buy Box 🚚: Stock": "buybox_stock",

  // Buy Box — Keepa format with green heart emoji 💚
  "Buy Box 💚: Current": "buybox_price",
  "Buy Box 💚: 90 days avg.": "buybox_price_avg_90d",
  "Buy Box 💚: 90 days drop %": "buybox_price_drop_90d",
  "Buy Box 💚: Lowest": "buybox_price_lowest",
  "Buy Box 💚: Highest": "buybox_price_highest",
  "Buy Box 💚: Stock": "buybox_stock",

  // New Buy Box format variants (plain)
  "New, Buy Box: Current": "buybox_price",
  "New, Buy Box: 90 days avg.": "buybox_price_avg_90d",
  "New, Buy Box: 90 days drop %": "buybox_price_drop_90d",
  "New, Buy Box: Lowest": "buybox_price_lowest",
  "New, Buy Box: Highest": "buybox_price_highest",
  "New, Buy Box: Stock": "buybox_stock",

  // New Buy Box — combined with truck emoji 🚚
  "New, Buy Box 🚚: Current": "buybox_price",
  "New, Buy Box 🚚: 90 days avg.": "buybox_price_avg_90d",
  "New, Buy Box 🚚: 90 days drop %": "buybox_price_drop_90d",
  "New, Buy Box 🚚: Lowest": "buybox_price_lowest",
  "New, Buy Box 🚚: Highest": "buybox_price_highest",
  "New, Buy Box 🚚: Stock": "buybox_stock",

  // New Buy Box — combined with green heart emoji 💚
  "New, Buy Box 💚: Current": "buybox_price",
  "New, Buy Box 💚: 90 days avg.": "buybox_price_avg_90d",
  "New, Buy Box 💚: 90 days drop %": "buybox_price_drop_90d",
  "New, Buy Box 💚: Lowest": "buybox_price_lowest",
  "New, Buy Box 💚: Highest": "buybox_price_highest",
  "New, Buy Box 💚: Stock": "buybox_stock",

  // Referral Fee
  "Referral Fee based on current Buy Box price": "referral_fee",
  "Referral Fee%": "referral_fee",

  // Offers
  "Total Offer Count": "offer_count_total",
  "New Offer Count: Current": "new_offer_count_current",
  "New Offer Count: 90 days avg.": "new_offer_count_avg_90d",
  "Count of retrieved live offers: New, FBA": "new_offer_count_current",

  // Categories
  "Categories: Root": "category_root",
  "Categories: Sub": "category_sub",
  "Categories: Tree": "category_tree",

  // Product details
  "Brand": "brand",
  "Release Date": "release_date",
  "Package: Dimension (cm³)": "package_dimension_cm3",
  "Package: Weight (g)": "package_weight_g",
  "Package: Quantity": "package_quantity",
  "Item: Package Quantity": "package_quantity",

  // Flags
  "Is HazMat": "is_hazmat",
  "Is heat sensitive": "is_heat_sensitive",

  // URLs
  "URL: Amazon": "amazon_url",
};

// Strips emojis, "New, " / "New " prefix, and extra whitespace from a Buy Box header
// so that ANY variant like "New, Buy Box 🚚: Current" normalizes to "Buy Box: Current"
function stripBuyBoxDecorations(header: string): string {
  return header
    // Remove all emoji characters (covers most Unicode emoji ranges)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, "")
    // Remove zero-width characters and other invisible Unicode
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, "")
    // Remove "New, " or "New " prefix (case-insensitive)
    .replace(/^new,?\s*/i, "")
    // Collapse multiple spaces into one
    .replace(/\s+/g, " ")
    .trim();
}

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
    // Remove currency symbols ($, €, £, ¥), commas, percent signs, and whitespace
    const cleaned = raw.replace(/[,%$€£¥\s]/g, "").trim();
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

  // Log ALL CSV headers for debugging field mapping
  const csvHeaders = parsed.meta?.fields ?? [];
  console.log(`[keepaCsvParser] CSV headers found (${csvHeaders.length}): ${csvHeaders.join(" | ")}`);

  const mappedHeaders = Object.keys(KEEPA_FIELD_MAP);
  const matched = csvHeaders.filter((h) => h in KEEPA_FIELD_MAP);
  const unmatchedCsv = csvHeaders.filter((h) => !(h in KEEPA_FIELD_MAP));
  console.log(`[keepaCsvParser] Matched ${matched.length} headers: ${matched.join(", ")}`);
  if (unmatchedCsv.length > 0) {
    console.log(`[keepaCsvParser] CSV headers NOT in field map: ${unmatchedCsv.join(" | ")}`);
  }

  const valid: UpsertProductData[] = [];
  const errors: ParseResult["errors"] = [];
  const totalRows = parsed.data.length;

  // Built once from the first row's headers, reused for all rows
  let normalizedHeaderMap: Map<string, string> | undefined;

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

    // Build a normalized lookup for this row's headers (handles case/whitespace/emoji differences)
    if (!normalizedHeaderMap) {
      normalizedHeaderMap = new Map();
      const csvHeaderKeys = Object.keys(row);

      // Pass 1: exact match after trimming
      for (const csvHeader of csvHeaderKeys) {
        const normalized = csvHeader.trim();
        if (normalized in KEEPA_FIELD_MAP) {
          normalizedHeaderMap.set(normalized, csvHeader);
        }
      }

      // Pass 2: case-insensitive/whitespace-normalized matching
      for (const keepaHeader of Object.keys(KEEPA_FIELD_MAP)) {
        if (normalizedHeaderMap.has(keepaHeader)) continue;
        const normalizedExpected = keepaHeader.toLowerCase().replace(/\s+/g, " ").trim();
        for (const csvHeader of csvHeaderKeys) {
          const normalizedCsv = csvHeader.toLowerCase().replace(/\s+/g, " ").trim();
          if (normalizedCsv === normalizedExpected) {
            normalizedHeaderMap.set(keepaHeader, csvHeader);
            break;
          }
        }
      }

      // Pass 3: for still-unmatched CSV headers containing "Buy Box",
      // strip emojis & "New," prefix, then match against the plain "Buy Box: X" variants
      const matchedCsvHeaders = new Set(normalizedHeaderMap.values());
      for (const csvHeader of csvHeaderKeys) {
        if (matchedCsvHeaders.has(csvHeader)) continue;
        const lower = csvHeader.toLowerCase();
        if (!lower.includes("buy box")) continue;

        const stripped = stripBuyBoxDecorations(csvHeader);
        // Try to find a matching KEEPA_FIELD_MAP key that matches after stripping
        if (stripped in KEEPA_FIELD_MAP) {
          normalizedHeaderMap.set(stripped, csvHeader);
          console.log(`[keepaCsvParser] Fuzzy-matched Buy Box header: "${csvHeader}" → "${stripped}"`);
        } else {
          // Also try case-insensitive match on the stripped version
          for (const keepaHeader of Object.keys(KEEPA_FIELD_MAP)) {
            if (normalizedHeaderMap.has(keepaHeader)) continue;
            if (stripBuyBoxDecorations(keepaHeader).toLowerCase() === stripped.toLowerCase()) {
              normalizedHeaderMap.set(keepaHeader, csvHeader);
              console.log(`[keepaCsvParser] Fuzzy-matched Buy Box header: "${csvHeader}" → "${keepaHeader}"`);
              break;
            }
          }
        }
      }
    }

    for (const [keepaHeader, dbField] of Object.entries(KEEPA_FIELD_MAP)) {
      const actualHeader = normalizedHeaderMap.get(keepaHeader);
      if (actualHeader && actualHeader in row) {
        const parsed = parseValue(dbField, row[actualHeader] ?? "");
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
