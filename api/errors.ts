import type { ContentfulStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
  readonly statusCode: ContentfulStatusCode;
  readonly code?: string;

  constructor(message: string, statusCode: ContentfulStatusCode = 500, code?: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
