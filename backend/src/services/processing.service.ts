import { v4 as uuidv4 } from "uuid";
import { asinProcessingQueue, AsinProcessingJobData } from "../lib/queue";
import { productsRepository } from "../repositories/products.repository";
import { redisConnection } from "../lib/queue";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";

export type ProcessingMode = "100" | "200" | "unchecked";

export interface ProcessingJobStatus {
  jobId: string;
  status: "running" | "completed" | "failed" | "idle";
  total: number;
  processed: number;
  percentage: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  asins?: string[];
  summary?: {
    allowed: number;
    gated: number;
    restricted: number;
    unknown: number;
  };
}

const ACTIVE_JOB_KEY = "asin:processing:active_job_id";
const JOB_STATUS_PREFIX = "asin:processing:status:";
const CANCEL_FLAG_PREFIX = "asin:processing:cancel:";

export const processingService = {
  async startProcessing(mode: ProcessingMode): Promise<{ jobId: string; totalAsins: number }> {
    // Prevent double-run
    const activeJobId = await redisConnection.get(ACTIVE_JOB_KEY);
    if (activeJobId) {
      const status = await processingService.getJobStatus(activeJobId);
      if (status?.status === "running") {
        throw new Error("A processing job is already running. Please wait for it to complete.");
      }
    }

    const products = await productsRepository.findAsinsForProcessing(mode);
    if (products.length === 0) {
      throw new Error("No ASINs found for the selected processing mode.");
    }

    const asins = products.map((p) => p.asin);
    const jobId = uuidv4();

    // Store initial status in Redis
    const initialStatus: ProcessingJobStatus = {
      jobId,
      status: "running",
      total: asins.length,
      processed: 0,
      percentage: 0,
      startedAt: new Date().toISOString(),
      asins,
    };

    await redisConnection.setex(
      `${JOB_STATUS_PREFIX}${jobId}`,
      86400, // TTL: 24 hours
      JSON.stringify(initialStatus),
    );
    await redisConnection.setex(ACTIVE_JOB_KEY, 86400, jobId);

    // Enqueue job
    const jobData: AsinProcessingJobData = { jobId, asins, totalCount: asins.length };
    await asinProcessingQueue.add("process-asins", jobData, { jobId });

    logger.info(`Processing job ${jobId} enqueued with ${asins.length} ASINs (mode: ${mode})`);

    return { jobId, totalAsins: asins.length };
  },

  async getJobStatus(jobId: string): Promise<ProcessingJobStatus | null> {
    const raw = await redisConnection.get(`${JOB_STATUS_PREFIX}${jobId}`);
    if (!raw) return null;

    const status = JSON.parse(raw) as ProcessingJobStatus;

    // Add summary for both running and completed states (real-time counts)
    if (status.status === "running" || status.status === "completed") {
      const summary = await processingService.getJobSummary(jobId);
      return { ...status, summary };
    }

    return status;
  },

  async getJobSummary(jobId: string) {
    const raw = await redisConnection.get(`${JOB_STATUS_PREFIX}${jobId}`);
    if (!raw) return null;

    const status = JSON.parse(raw) as ProcessingJobStatus;
    const asins = status.asins ?? [];

    if (asins.length === 0) return null;

    // Count by status from DB
    const statuses = await prisma.sellerStatus.findMany({
      where: { asin: { in: asins } },
      select: { status: true },
    });

    return {
      allowed: statuses.filter((s) => s.status === "allowed").length,
      gated: statuses.filter((s) => s.status === "gated").length,
      restricted: statuses.filter((s) => s.status === "restricted").length,
      unknown: statuses.filter((s) => s.status === "unknown").length,
    };
  },

  async getActiveJobStatus(): Promise<ProcessingJobStatus | null> {
    const activeJobId = await redisConnection.get(ACTIVE_JOB_KEY);
    if (!activeJobId) return null;
    return processingService.getJobStatus(activeJobId);
  },

  async updateJobProgress(jobId: string, processed: number, total: number): Promise<void> {
    const key = `${JOB_STATUS_PREFIX}${jobId}`;
    const raw = await redisConnection.get(key);
    if (!raw) return;

    const status = JSON.parse(raw) as ProcessingJobStatus;
    status.processed = processed;
    status.percentage = Math.round((processed / total) * 100);

    await redisConnection.setex(key, 86400, JSON.stringify(status));
  },

  async markJobCompleted(jobId: string): Promise<void> {
    const key = `${JOB_STATUS_PREFIX}${jobId}`;
    const raw = await redisConnection.get(key);
    if (!raw) {
      logger.warn(`[Processing] Cannot mark job ${jobId} as completed - not found in Redis`);
      return;
    }
  
    const status = JSON.parse(raw) as ProcessingJobStatus;
    status.status = "completed";
    status.percentage = 100;
    status.completedAt = new Date().toISOString();
  
    await redisConnection.setex(key, 86400, JSON.stringify(status));
    // 🔥 אל תמחק מיד - תן לו 1 דקה TTL
    await redisConnection.setex(ACTIVE_JOB_KEY, 60, jobId); // 60 שניות במקום למחוק
    
    logger.info(`[Processing] Job ${jobId} marked as completed`);
  },

  async markJobFailed(jobId: string, error: string): Promise<void> {
    const key = `${JOB_STATUS_PREFIX}${jobId}`;
    const raw = await redisConnection.get(key);
    if (!raw) return;

    const status = JSON.parse(raw) as ProcessingJobStatus;
    status.status = "failed";
    status.error = error;
    status.completedAt = new Date().toISOString();

    await redisConnection.setex(key, 86400, JSON.stringify(status));
    await redisConnection.del(ACTIVE_JOB_KEY);
  },

  async cancelJob(): Promise<{ cancelled: boolean; jobId?: string }> {
    const activeJobId = await redisConnection.get(ACTIVE_JOB_KEY);
    if (!activeJobId) {
      return { cancelled: false };
    }

    const status = await processingService.getJobStatus(activeJobId);
    if (!status || status.status !== "running") {
      return { cancelled: false };
    }

    // Set cancel flag in Redis — worker checks this between batches
    await redisConnection.setex(`${CANCEL_FLAG_PREFIX}${activeJobId}`, 3600, "1");
    logger.info(`[Processing] Cancel flag set for job ${activeJobId}`);

    return { cancelled: true, jobId: activeJobId };
  },

  async isJobCancelled(jobId: string): Promise<boolean> {
    const flag = await redisConnection.get(`${CANCEL_FLAG_PREFIX}${jobId}`);
    return flag === "1";
  },

  async markJobCancelled(jobId: string, processed: number, total: number): Promise<void> {
    const key = `${JOB_STATUS_PREFIX}${jobId}`;
    const raw = await redisConnection.get(key);
    if (!raw) return;

    const status = JSON.parse(raw) as ProcessingJobStatus;
    status.status = "failed";
    status.error = `Cancelled by user (${processed}/${total} processed)`;
    status.completedAt = new Date().toISOString();

    await redisConnection.setex(key, 86400, JSON.stringify(status));
    await redisConnection.del(ACTIVE_JOB_KEY);
    await redisConnection.del(`${CANCEL_FLAG_PREFIX}${jobId}`);

    logger.info(`[Processing] Job ${jobId} cancelled (${processed}/${total} processed)`);
  },
};