import { ErrorHandler as HonoErrorHandler } from "hono";
import { AppError } from "./errors/index.js";
import { ErrorMiddlewareOptions } from "./types";

const defaultOptions: Required<ErrorMiddlewareOptions> = {
  showStack: process.env.NODE_ENV === "development",
  logErrors: true,
  customErrorMap: {},
  logger: {
    error: (message: string, error?: Error) => {
      console.error(message, error);
    },
  },
  formatResponse: (error, path) => ({
    error: error.message,
    details: error instanceof AppError ? error.details : undefined,
    statusCode: error instanceof AppError ? error.statusCode : 500,
    timestamp: new Date().toISOString(),
    path,
    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
  }),
};

export function createErrorHandler(options: ErrorMiddlewareOptions): HonoErrorHandler {
  const config = { ...defaultOptions, ...options };
  return (error: Error, c) => {
    const path = c.req.path;

    if (config.logErrors) {
      config.logger.error(`Error occurred on path: ${path}`, error);
    }

    let statusCode: number = 500;

    if (error instanceof AppError) {
      statusCode = error.statusCode;
    } else if (error.name in config.customErrorMap) {
      const mappedStatus = config.customErrorMap[error.name];
      if (mappedStatus !== undefined) {
        statusCode = mappedStatus;
      }
    }
    const response = config.formatResponse(error, path);

    return c.json(response, statusCode as any);
  };
}
