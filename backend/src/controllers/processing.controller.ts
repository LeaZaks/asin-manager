import { Request, Response } from "express";
import { processingService, ProcessingMode } from "../services/processing.service";
import { AppError } from "../middleware/errorHandler";

const VALID_MODES: ProcessingMode[] = ["100", "200", "unchecked"];

export const processingController = {
  async startJob(req: Request, res: Response) {
    const { mode } = req.body as { mode?: string };

    if (!mode || !VALID_MODES.includes(mode as ProcessingMode)) {
      throw new AppError(400, `mode must be one of: ${VALID_MODES.join(", ")}`);
    }

    const result = await processingService.startProcessing(mode as ProcessingMode);
    res.json({
      message: "Processing job started",
      jobId: result.jobId,
      totalAsins: result.totalAsins,
    });
  },

  async getActiveStatus(_req: Request, res: Response) {
    const status = await processingService.getActiveJobStatus();
    if (!status) {
      res.json({ status: "idle", total: 0, processed: 0, percentage: 0 });
      return;
    }
    res.json(status);
  },

  async getJobStatus(req: Request, res: Response) {
    const { jobId } = req.params;
    const status = await processingService.getJobStatus(jobId);
    if (!status) throw new AppError(404, `Job ${jobId} not found`);
    res.json(status);
  },

  async cancelJob(_req: Request, res: Response) {
    const result = await processingService.cancelJob();
    if (!result.cancelled) {
      throw new AppError(400, "No active processing job to cancel");
    }
    res.json({ message: "Cancellation requested", jobId: result.jobId });
  },
};
