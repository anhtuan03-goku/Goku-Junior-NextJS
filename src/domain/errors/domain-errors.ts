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
  constructor(message = "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Bạn không có quyền thực hiện thao tác này.") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Không tìm thấy tài nguyên yêu cầu.") {
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
    message = "Bạn thao tác quá nhanh, vui lòng thử lại sau ít giây.",
    retryAfterSeconds = 30,
  ) {
    super(message, "RATE_LIMITED", 429);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
