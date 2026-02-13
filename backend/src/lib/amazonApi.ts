import { logger } from "../lib/logger";

export type SellerStatusResult =
  | "allowed"
  | "gated"
  | "requires_invoice"
  | "restricted"
  | "unknown";

// Amazon SP-API response types (simplified for our use case)
interface SPApiEligibilityResult {
  marketplaceId: string;
  asin: string;
  eligibilityStatus: string; // "ELIGIBLE" | "NOT_ELIGIBLE"
  reasons?: Array<{ reasonCode: string; message: string }>;
}

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches a fresh LWA access token using the refresh token flow.
 */
async function getAccessToken(): Promise<string> {
  const response = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.AMAZON_SP_API_REFRESH_TOKEN ?? "",
      client_id: process.env.AMAZON_SP_API_CLIENT_ID ?? "",
      client_secret: process.env.AMAZON_SP_API_CLIENT_SECRET ?? "",
    }),
  });

  if (!response.ok) {
    throw new Error(`LWA token fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Check seller eligibility for a single ASIN via Amazon SP-API.
 * Implements retry with exponential backoff for rate limits.
 */
export async function checkAsinEligibility(
  asin: string,
): Promise<SellerStatusResult> {
  const marketplaceId =
    process.env.AMAZON_SP_API_MARKETPLACE_ID ?? "ATVPDKIKX0DER";

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const accessToken = await getAccessToken();

      const url = new URL(
        `https://sellingpartnerapi-na.amazon.com/fba/inbound/v0/eligibility/itemPreview`,
      );
      url.searchParams.set("asin", asin);
      url.searchParams.set("program", "INBOUND");
      url.searchParams.set("marketplaceIds", marketplaceId);

      const response = await fetch(url.toString(), {
        headers: {
          "x-amz-access-token": accessToken,
          "Content-Type": "application/json",
        },
      });

      // Rate limit – wait and retry
      if (response.status === 429) {
        const retryAfter = parseInt(
          response.headers.get("retry-after") ?? "2",
          10,
        );
        const waitMs = retryAfter * 1000 || INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        logger.warn(`[Amazon API] Rate limit for ASIN ${asin}, waiting ${waitMs}ms (attempt ${attempt})`);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(`SP-API error ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as {
        payload: SPApiEligibilityResult;
      };

      return mapEligibilityToStatus(data.payload);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        logger.warn(`[Amazon API] Attempt ${attempt} failed for ASIN ${asin}: ${lastError.message}, retrying in ${backoff}ms`);
        await sleep(backoff);
      }
    }
  }

  logger.error(`[Amazon API] All retries exhausted for ASIN ${asin}: ${lastError?.message}`);
  throw lastError ?? new Error("Unknown error");
}

function mapEligibilityToStatus(
  result: SPApiEligibilityResult,
): SellerStatusResult {
  if (result.eligibilityStatus === "ELIGIBLE") {
    return "allowed";
  }

  const reasons = result.reasons ?? [];
  const reasonCodes = reasons.map((r) => r.reasonCode);

  if (reasonCodes.includes("GATED_BY_BRAND") || reasonCodes.includes("GATED_BY_CATEGORY")) {
    return "gated";
  }
  if (reasonCodes.includes("REQUIRES_INVOICE")) {
    return "requires_invoice";
  }
  if (reasonCodes.includes("INELIGIBLE")) {
    return "restricted";
  }

  return "unknown";
}
