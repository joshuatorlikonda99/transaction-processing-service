import os from 'node:os';
import { Request, Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { AppConfig } from '../../config';
import { ValidationError } from '../../core/appError';
import { TransactionService } from '../../services/transaction.service';
import { StatusController } from '../controllers/status.controller';
import { UploadController } from '../controllers/upload.controller';

function isCsvFile(file: Express.Multer.File): boolean {
  const name = file.originalname.toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  return (
    name.endsWith('.csv') ||
    mime === 'text/csv' ||
    mime === 'application/csv' ||
    mime === 'application/vnd.ms-excel'
  );
}

export function createTransactionRouter(
  transactionService: TransactionService,
  config: AppConfig,
): Router {
  const router = Router();
  const uploadController = new UploadController(transactionService);
  const statusController = new StatusController(transactionService);

  const upload = multer({
    dest: os.tmpdir(),
    limits: {
      fileSize: config.maxFileSizeBytes,
      files: 1,
    },
    fileFilter: (
      _req: Request,
      file: Express.Multer.File,
      cb: FileFilterCallback,
    ) => {
      if (!isCsvFile(file)) {
        cb(
          new ValidationError(
            'Only CSV files are accepted',
            undefined,
            'INVALID_FILE_TYPE',
          ),
        );
        return;
      }
      cb(null, true);
    },
  });

  router.post('/upload', upload.single('file'), uploadController.upload);
  router.post('/:transactionId/retry', statusController.retry);
  router.get('/:transactionId', statusController.getStatus);

  return router;
}
