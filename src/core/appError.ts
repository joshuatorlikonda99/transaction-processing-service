export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown, code = 'VALIDATION_ERROR') {
    super(400, code, message, details);
    this.name = 'ValidationError';
  }
}

export class InvalidTransitionError extends AppError {
  constructor(from: string, to: string, allowed: readonly string[] = []) {
    super(
      409,
      'INVALID_STATE_TRANSITION',
      `Cannot transition transaction from ${from} to ${to}`,
      { from, to, allowed },
    );
    this.name = 'InvalidTransitionError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found', code = 'NOT_FOUND') {
    super(404, code, message);
    this.name = 'NotFoundError';
  }
}
