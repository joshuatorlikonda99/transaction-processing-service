import { AppConfig } from '../src/config';
import { Transaction, TransactionStatus } from '../src/types/transaction';

export const testConfig: AppConfig = {
  port: 0,
  concurrencyLimit: 5,
  maxRetries: 3,
  processDelayMs: 15,
  failureRate: 0,
  maxFileSizeBytes: 2 * 1024 * 1024,
  maxQueuePending: 100,
};

export function makeTransaction(
  overrides: Partial<Transaction> = {},
): Transaction {
  const now = new Date();
  return {
    transactionId: 'txn-1',
    userId: 'user-1',
    amount: 10,
    status: TransactionStatus.PENDING,
    retryCount: 0,
    maxRetries: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
