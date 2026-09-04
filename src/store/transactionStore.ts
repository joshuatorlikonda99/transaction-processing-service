import { AppError, NotFoundError } from '../core/appError';
import { NewTransaction, Transaction, TransactionStatus } from '../types/transaction';

export class TransactionStore {
  private readonly records = new Map<string, Transaction>();

  create(input: NewTransaction, maxRetries: number): Transaction {
    if (this.records.has(input.transactionId)) {
      throw new AppError(
        409,
        'DUPLICATE_TRANSACTION',
        `Transaction ${input.transactionId} already exists`,
      );
    }

    const now = new Date();
    const record: Transaction = {
      transactionId: input.transactionId,
      userId: input.userId,
      amount: input.amount,
      // Initial state only. Every later change goes through stateMachine.transition().
      status: TransactionStatus.PENDING,
      retryCount: 0,
      maxRetries,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.transactionId, record);
    return record;
  }

  get(transactionId: string): Transaction | undefined {
    return this.records.get(transactionId);
  }

  getOrThrow(transactionId: string): Transaction {
    const record = this.records.get(transactionId);
    if (!record) {
      throw new NotFoundError(
        `Transaction ${transactionId} was not found`,
        'TRANSACTION_NOT_FOUND',
      );
    }
    return record;
  }

  exists(transactionId: string): boolean {
    return this.records.has(transactionId);
  }

  size(): number {
    return this.records.size;
  }
}
