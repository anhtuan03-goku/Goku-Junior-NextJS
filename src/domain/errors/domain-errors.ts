export class DomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code = "DOMAIN_ERROR", statusCode = 400) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Your session is invalid or has expired.") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "The requested resource was not found.") {
    super(message, "NOT_FOUND", 404);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

export class RateLimitError extends DomainError {
  public readonly retryAfterSeconds: number;

  constructor(
    message = "Too many requests. Please wait a moment and try again.",
    retryAfterSeconds = 30,
  ) {
    super(message, "RATE_LIMITED", 429);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
