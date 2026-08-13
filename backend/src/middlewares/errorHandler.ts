import { Request, Response, NextFunction } from "express";
import { isDatabaseConnectionError as isDbError } from "../utils/waitForDatabase.js";
import { ContentAnalysisError } from "../services/assessmentStudio/import/importErrors.js";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ContentAnalysisError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      importError: err.toPayload(),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ success: false, error: err.message });
  }

  // Handle specific Prisma/Connection errors for better UX
  const message = err.message || "";
  if (isDbError(err) || message.includes("ECONNREFUSED") || message.includes("Can't reach database")) {
    return res.status(503).json({
      success: false,
      error:
        "Database is offline. Start Docker Desktop, then run: docker compose -f docker-compose.dev.yml up -d postgres",
    });
  }

  if (message.includes("PrismaClientInitializationError") || message.includes("EPERM")) {
    return res.status(500).json({ 
      success: false, 
      error: "Database initialization failed (File Permission Issue). The system is attempting to auto-recover." 
    });
  }

  console.error(err);
  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
}

export function isDatabaseConnectionError(err: unknown): boolean {
  return isDbError(err);
}
