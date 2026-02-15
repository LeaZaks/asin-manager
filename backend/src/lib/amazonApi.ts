import aws4 from "aws4";
import axios from "axios";
import { logger } from "./logger";

export type SellerStatusResult =
  | "allowed"
  | "gated"
  | "requires_invoice"
  | "restricted"
  | "unknown";

const HOST = "sellingpartnerapi-na.amazon.com";
const REGION = "us-east-1";
const MARKETPLACE_ID = "ATVPDKIKX0DER";

// Token caching
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

const MAX_RETRIES = 3;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get LWA access token (with caching)
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  logger.info("[Amazon API] Fetching new access token");

  try {
    const response = await axios.post("https://api.amazon.com/auth/o2/token", {
      grant_type: "refresh_token",
      refresh_token: process.env.LWA_REFRESH_TOKEN ?? "",
      client_id: process.env.LWA_CLIENT_ID ?? "",
      client_secret: process.env.LWA_CLIENT_SECRET ?? "",
    });

    cachedToken = response.data.access_token;
    tokenExpiresAt = now + (response.data.expires_in - 60) * 1000;

    logger.info("[Amazon API] ✅ Access token refreshed successfully");
    return cachedToken;
  } catch (err: unknown) {
    const error = err as { response?: { status?: number; data?: unknown }; message?: string };
    
    // Log detailed error information
    logger.error("[Amazon API] ❌ LWA Token Error - Full Details:", {
      status: error?.response?.status,
      errorData: error?.response?.data,
      message: error?.message,
      // Show if credentials are set (but not the actual values)
      hasClientId: !!process.env.LWA_CLIENT_ID,
      hasClientSecret: !!process.env.LWA_CLIENT_SECRET,
      hasRefreshToken: !!process.env.LWA_REFRESH_TOKEN,
      refreshTokenLength: process.env.LWA_REFRESH_TOKEN?.length,
    });
    
    throw new Error(`LWA token fetch failed: ${error?.response?.status}`);
  }
}

/**
 * Make signed request to Amazon SP-API
 */
async function amazonRequest({ path, method = "GET" }: { path: string; method?: string }) {
  const accessToken = await getAccessToken();

  const opts: aws4.Request = {
    host: HOST,
    path,
    service: "execute-api",
    region: REGION,
    method,
    headers: {
      "x-amz-access-token": accessToken,
      "content-type": "application/json",
    },
  };

  // Sign request with IAM credentials
  aws4.sign(opts, {
    accessKeyId: process.env.AWS_ACCESS_KEY ?? "",
    secretAccessKey: process.env.AWS_SECRET_KEY ?? "",
  });

  const url = `https://${HOST}${path}`;

  const res = await axios({
    url,
    method,
    headers: opts.headers,
  });

  return res.data;
}

/**
 * Check ASIN restriction status
 */
export async function checkAsinEligibility(
  asin: string,
  retries = MAX_RETRIES,
): Promise<SellerStatusResult> {
  const query = new URLSearchParams({
    asin,
    sellerId: process.env.SELLER_ID ?? "",
    marketplaceIds: MARKETPLACE_ID,
  }).toString();

  const path = `/listings/2021-08-01/restrictions?${query}`;

  logger.info(`[Amazon API] Checking ASIN: ${asin}`);

  try {
    const data = await amazonRequest({ path });
    
    logger.info(`[Amazon API] ✅ Response for ${asin}:`, JSON.stringify(data));

    // No restrictions = allowed
    if (!data?.restrictions || data.restrictions.length === 0) {
      return "allowed";
    }

    // Check new_new condition
    const newCondition = data.restrictions.find(
      (r: { conditionType: string }) => r.conditionType === "new_new",
    );

    if (!newCondition) {
      return "allowed";
    }

    const reasonCode = newCondition?.reasons?.[0]?.reasonCode;

    if (!reasonCode) {
      return "allowed";
    }

    // Map reason codes
    if (reasonCode === "APPROVAL_REQUIRED") {
      return "gated";
    }
    if (reasonCode === "NOT_ELIGIBLE") {
      return "restricted";
    }
    if (reasonCode === "ASIN_NOT_FOUND") {
      return "unknown";
    }

    return "unknown";

  } catch (err: unknown) {
    const error = err as { response?: { status?: number; data?: unknown }; message?: string };
    const statusCode = error?.response?.status;

    // Rate limit or server error - retry
    if ((statusCode === 429 || (statusCode && statusCode >= 500)) && retries > 0) {
      const delay = (MAX_RETRIES - retries + 1) * 1000;
      logger.warn(`[Amazon API] Rate limit/error for ${asin}, retrying in ${delay}ms (${retries} left)`);
      await sleep(delay);
      return checkAsinEligibility(asin, retries - 1);
    }

    // Final failure
    logger.error(`[Amazon API] ❌ Error for ${asin}:`, {
      status: statusCode,
      message: error?.message,
      data: error?.response?.data,
    });

    return "unknown";
  }
}