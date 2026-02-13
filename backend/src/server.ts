import "express-async-errors";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

import { logger } from "./lib/logger";
import { asinProcessingQueue } from "./lib/queue";
import { errorHandler } from "./middleware/errorHandler";

// Routes
import productsRouter from "./routes/products.routes";
import importRouter from "./routes/import.routes";
import processingRouter from "./routes/processing.routes";
import tagsRouter from "./routes/tags.routes";
import evaluationsRouter from "./routes/evaluations.routes";

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

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info(`Bull Board at http://localhost:${PORT}/admin/queues`);
});

export default app;
