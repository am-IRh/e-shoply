export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperation: boolean;
  public readonly details?: any;

  constructor(message: string, statusCode: number, isOperation: boolean = false, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.isOperation = isOperation;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = ":| Not Found") {
    super(message, 404);
  }
}

// VALIDATION ERROR
export class ValidationError extends AppError {
  constructor(message = ":| inValid request data", details?: any) {
    super(message, 400, true, details);
  }
}

export class AuthError extends AppError {
  constructor(message = ":| UnAuthorized Error") {
    super(message, 401);
  }
}

// Forbidden Error
export class ForbiddenError extends AppError {
  constructor(message = ":| Forbidden access") {
    super(message, 403);
  }
}

// Database Error
export class DatabaseError extends AppError {
  constructor(message = ":| Database Error", details?: any) {
    super(message, 500, true, details);
  }
}

// RateLimit error
export class RateLimitError extends AppError {
  constructor(message = ":| Rate Limit Exceeded", details?: any) {
    super(message, 429);
  }
}
