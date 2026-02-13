import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error(err);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Prisma errors
  if (err.name === "PrismaClientKnownRequestError") {
    res.status(400).json({ error: "Database constraint violation", detail: err.message });
    return;
  }

  res.status(500).json({
    error: "Internal server error",
    ...(process.env.NODE_ENV !== "production" && { detail: err.message }),
  });
}
