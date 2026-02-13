import { Queue } from "bullmq";
import IORedis from "ioredis";
import { logger } from "./logger";

// ── Redis connection ──────────────────────────────────────────────────────────
export const redisConnection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  },
);

redisConnection.on("connect", () => logger.info("Redis connected"));
redisConnection.on("error", (err) => logger.error("Redis error:", err));

// ── Queue names ───────────────────────────────────────────────────────────────
export const QUEUE_NAMES = {
  ASIN_PROCESSING: "asin-processing",
} as const;

// ── ASIN Processing Queue ─────────────────────────────────────────────────────
export const asinProcessingQueue = new Queue(QUEUE_NAMES.ASIN_PROCESSING, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000, // 2s, 4s, 8s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

// ── Job data types ────────────────────────────────────────────────────────────
export interface AsinProcessingJobData {
  jobId: string;      // unique run identifier
  asins: string[];    // list of ASINs to process
  totalCount: number;
}
