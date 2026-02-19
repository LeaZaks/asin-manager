import "express-async-errors";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import { logger } from "./lib/logger";
import { asinProcessingQueue, redisConnection } from "./lib/queue";
import { prisma } from "./lib/prisma";
import { errorHandler } from "./middleware/errorHandler";

// Routes
import productsRouter from "./routes/products.routes";
import importRouter from "./routes/import.routes";
import processingRouter from "./routes/processing.routes";
import tagsRouter from "./routes/tags.routes";
import evaluationsRouter from "./routes/evaluations.routes";
import sourcesRouter from "./routes/sources.routes";
import { sourcesController } from "./controllers/sources.controller";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5173" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Bull Board (queue dashboard) ──────────────────────────────────────────────
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(asinProcessingQueue)],
  serverAdapter,
});
app.use("/admin/queues", serverAdapter.getRouter());

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/products", productsRouter);
app.use("/api/import", importRouter);
app.use("/api/processing", processingRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/evaluations", evaluationsRouter);
app.use("/api/products/:asin/sources", sourcesRouter);
app.get("/api/sources", sourcesController.listAll);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  const checks: Record<string, "ok" | "error"> = { db: "error", redis: "error" };
  try { await prisma.$queryRaw`SELECT 1`; checks.db = "ok"; } catch {}
  try { await redisConnection.ping(); checks.redis = "ok"; } catch {}
  const allOk = Object.values(checks).every((v) => v === "ok");
  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks,
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info(`Bull Board at http://localhost:${PORT}/admin/queues`);
});

export default app;
