import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError, NotFoundError } from '../core/appError';

export function notFoundHandler(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next(new NotFoundError());
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Uploaded file exceeds the configured size limit'
        : err.message;
    res.status(400).json({
      error: {
        code: err.code,
        message,
      },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected server error';
  console.error('Unhandled error', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
    },
  });
}
