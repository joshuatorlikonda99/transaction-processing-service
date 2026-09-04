import { AppError, NotFoundError } from './appError';
import { TransactionStateMachine } from './stateMachine';
import { TransactionStore } from '../store/transactionStore';
import { NewTransaction, Transaction, TransactionStatus } from '../types/transaction';

export class IdempotencyStore {
  constructor(
    private readonly store: TransactionStore,
    private readonly stateMachine: TransactionStateMachine,
  ) {}

  /**
   * Synchronous check-and-lock.
   *
   * There is no `await` between "does this id exist?" and "mark PROCESSING".
   * On Node's single-threaded event loop that pair is atomic: another request
   * cannot interleave until this function returns and the caller hits an await.
   */
  claimAndLock(input: NewTransaction, maxRetries: number): Transaction | null {
    if (this.store.exists(input.transactionId)) {
      return null;
    }

    const tx = this.store.create(input, maxRetries);
    this.stateMachine.transition(tx, TransactionStatus.PROCESSING);
    return tx;
  }

  /**
   * Synchronous retry lock: FAILED → PROCESSING in one tick, before any I/O.
   */
  lockForRetry(transactionId: string): Transaction {
    const tx = this.store.get(transactionId);
    if (!tx) {
      throw new NotFoundError(
        `Transaction ${transactionId} was not found`,
        'TRANSACTION_NOT_FOUND',
      );
    }
    if (tx.status !== TransactionStatus.FAILED) {
      throw new AppError(
        409,
        'RETRY_NOT_ALLOWED',
        `Only FAILED transactions can be retried (current status: ${tx.status})`,
      );
    }
    if (tx.retryCount >= tx.maxRetries) {
      throw new AppError(
        409,
        'MAX_RETRIES_EXCEEDED',
        `Transaction ${transactionId} has already been retried ${tx.retryCount} time(s)`,
      );
    }

    tx.retryCount += 1;
    tx.error = undefined;
    this.stateMachine.transition(tx, TransactionStatus.PROCESSING);
    return tx;
  }
}
