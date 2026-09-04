import { NextFunction, Request, Response } from 'express';
import { TransactionService } from '../../services/transaction.service';

export class StatusController {
  constructor(private readonly transactionService: TransactionService) {}

  getStatus = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    try {
      const transaction = this.transactionService.getById(
        req.params.transactionId,
      );
      res.status(200).json({
        transactionId: transaction.transactionId,
        userId: transaction.userId,
        amount: transaction.amount,
        status: transaction.status,
        retryCount: transaction.retryCount,
        maxRetries: transaction.maxRetries,
        error: transaction.error,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  };

  retry = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const transaction = await this.transactionService.retry(
        req.params.transactionId,
      );
      res.status(200).json({
        message: 'Retry completed',
        transactionId: transaction.transactionId,
        status: transaction.status,
        retryCount: transaction.retryCount,
        error: transaction.error,
      });
    } catch (error) {
      next(error);
    }
  };
}
