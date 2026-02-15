/**
 * ASIN Processing Worker
 * Run separately: npm run worker
 * Processes ASINs against Amazon SP-API as a background job.
 */
import "dotenv/config";
import { Worker, Job } from "bullmq";
import { SellerStatusEnum } from "@prisma/client";

import { QUEUE_NAMES, AsinProcessingJobData, redisConnection } from "../lib/queue";
import { checkAsinEligibility } from "../lib/amazonApi";
import { processingService } from "../services/processing.service";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

// Process ASINs in parallel batches for speed
const BATCH_SIZE = 5; // Process 5 ASINs concurrently
const BATCH_DELAY_MS = 200; // Small delay between batches

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processAsinJob(job: Job<AsinProcessingJobData>): Promise<void> {
  const { jobId, asins, totalCount } = job.data;

  logger.info(`[Worker] Starting job ${jobId} – ${totalCount} ASINs`);

  let processed = 0;

  // Process in batches of 5 for parallel execution
  for (let i = 0; i < asins.length; i += BATCH_SIZE) {
    const batch = asins.slice(i, i + BATCH_SIZE);
    
    // Process all ASINs in batch concurrently
    await Promise.all(
      batch.map(async (asin) => {
        try {
          const status = await checkAsinEligibility(asin);

          // Upsert SellerStatus
          await prisma.sellerStatus.upsert({
            where: { asin },
            create: {
              asin,
              status: status as SellerStatusEnum,
              checked_at: new Date(),
            },
            update: {
              status: status as SellerStatusEnum,
              checked_at: new Date(),
            },
          });

          logger.info(`[Worker] ASIN ${asin}: ${status}`);
        } catch (err) {
          // Per-ASIN failure: log, do NOT update checked_at, continue to next
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`[Worker] ASIN ${asin} failed: ${message}`);
        }

        processed++;
        await processingService.updateJobProgress(jobId, processed, totalCount);
        await job.updateProgress(Math.round((processed / totalCount) * 100));
      })
    );

    // Small delay between batches (not between individual ASINs!)
    if (i + BATCH_SIZE < asins.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  await processingService.markJobCompleted(jobId);
  logger.info(`[Worker] Job ${jobId} completed. Processed ${processed}/${totalCount}`);
}

// ── Worker instance ───────────────────────────────────────────────────────────
const worker = new Worker<AsinProcessingJobData>(
  QUEUE_NAMES.ASIN_PROCESSING,
  processAsinJob,
  {
    connection: redisConnection,
    concurrency: 1, // Process one job at a time (Amazon rate limits)
  },
);

worker.on("completed", (job) => {
  logger.info(`[Worker] Job ${job.id} completed`);
});

worker.on("failed", async (job, err) => {
  logger.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
  if (job?.data.jobId) {
    await processingService.markJobFailed(job.data.jobId, err.message);
  }
});

worker.on("error", (err) => {
  logger.error(`[Worker] Worker error: ${err.message}`);
});

logger.info(`[Worker] ASIN Processing Worker started, listening on queue: ${QUEUE_NAMES.ASIN_PROCESSING}`);

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("[Worker] Shutting down gracefully...");
  await worker.close();
  process.exit(0);
});