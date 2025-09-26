import { AppError } from "./errors/index.js";

export interface ErrorResponse {
  error: string;
  statusCode: number;
  timestamp: string;
  path: string;
  stack?: string;
  details?: any;
}

export interface ErrorMiddlewareOptions {
  showStack?: boolean;
  logErrors?: boolean;
  customErrorMap?: Record<string, number>;
  formatResponse?: (error: AppError | Error, path: string) => ErrorResponse;
  logger?: {
    error: (message: string, error?: Error) => void;
  };
}

export type ErrorHandler = (error: Error, path: string, options: ErrorMiddlewareOptions) => ErrorResponse;
