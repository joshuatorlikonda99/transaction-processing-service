import { unlink } from 'node:fs/promises';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../../core/appError';
import { TransactionService } from '../../services/transaction.service';

export class UploadController {
  constructor(private readonly transactionService: TransactionService) {}

  upload = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const file = req.file;
    if (!file) {
      next(
        new ValidationError(
          'A CSV file is required. Upload it as multipart field "file".',
          undefined,
          'FILE_REQUIRED',
        ),
      );
      return;
    }

    try {
      const summary = await this.transactionService.processUpload(file.path);
      res.status(200).json(summary);
    } catch (error) {
      next(error);
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  };
}
