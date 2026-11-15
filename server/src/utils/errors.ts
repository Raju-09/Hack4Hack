/**
 * Application error classes.
 * All errors extend AppError, which carries HTTP status and a machine-readable code.
 * The central error handler maps these to consistent JSON responses.
 */

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 400 — Request is syntactically invalid
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

// 401 — Caller is not authenticated
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
}

// 403 — Caller is authenticated but not permitted
export class ForbiddenError extends AppError {
  constructor(message = "You are not permitted to perform this action") {
    super(403, "FORBIDDEN", message);
  }
}

// 404 — Resource does not exist OR is intentionally hidden
export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(404, "NOT_FOUND", `${resource} not found`);
  }
}

// 409 — Business-state conflict
export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export class TeamFullError extends ConflictError {
  constructor() {
    super("TEAM_FULL", "This team has no available seats");
  }
}

export class AlreadyMemberError extends ConflictError {
  constructor() {
    super("ALREADY_MEMBER", "You are already a member of a team in this hackathon");
  }
}

export class RequestExistsError extends ConflictError {
  constructor() {
    super("REQUEST_EXISTS", "You have already submitted a join request for this team");
  }
}

export class DuplicateTeamNameError extends ConflictError {
  constructor() {
    super("DUPLICATE_TEAM_NAME", "A team with this name already exists in this hackathon");
  }
}

// 422 — Valid syntax but invalid business state
export class UnprocessableError extends AppError {
  constructor(code: string, message: string) {
    super(422, code, message);
  }
}

export class InviteExpiredError extends UnprocessableError {
  constructor() {
    super("INVITE_EXPIRED", "This invitation has expired");
  }
}

export class InviteRevokedError extends UnprocessableError {
  constructor() {
    super("INVITE_REVOKED", "This invitation has been revoked");
  }
}

export class InviteUsedUpError extends UnprocessableError {
  constructor() {
    super("INVITE_MAX_USES", "This invitation has reached its maximum usage limit");
  }
}

export class WrongHackathonError extends UnprocessableError {
  constructor() {
    super("INVITE_WRONG_HACKATHON", "This invitation belongs to a different hackathon");
  }
}

export class RequestNotPendingError extends UnprocessableError {
  constructor() {
    super("REQUEST_NOT_PENDING", "This request is no longer pending");
  }
}

export class HackathonClosedError extends UnprocessableError {
  constructor() {
    super("HACKATHON_CLOSED", "This hackathon is no longer accepting team changes");
  }
}

// 429 — Rate limit
export class RateLimitError extends AppError {
  constructor() {
    super(429, "RATE_LIMIT", "Too many requests. Please slow down.");
  }
}

// 500 — Unexpected
export class InternalError extends AppError {
  constructor(message = "An unexpected error occurred") {
    super(500, "INTERNAL_ERROR", message);
  }
}
