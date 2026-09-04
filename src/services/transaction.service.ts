import { AppConfig } from '../config';
import { NotFoundError } from '../core/appError';
import { ConcurrencyQueue } from '../core/concurrencyQueue';
import { IdempotencyStore } from '../core/idempotencyStore';
import { TransactionStateMachine } from '../core/stateMachine';
import { validateCsvRow } from '../middleware/validateCsvRow';
import { TransactionStore } from '../store/transactionStore';
import {
  Transaction,
  TransactionStatus,
  UploadStats,
  UploadSummary,
} from '../types/transaction';
import { CsvService } from './csv.service';
import { ProcessorService } from './processor.service';

export class TransactionService {
  constructor(
    private readonly store: TransactionStore,
    private readonly csvService: CsvService,
    private readonly processor: ProcessorService,
    private readonly queue: ConcurrencyQueue,
    private readonly idempotency: IdempotencyStore,
    private readonly stateMachine: TransactionStateMachine,
    private readonly config: AppConfig,
  ) {}

  async processUpload(filePath: string): Promise<UploadSummary> {
    const stats: UploadStats = {
      totalTransactions: 0,
      processed: 0,
      failed: 0,
      duplicates: 0,
      invalid: 0,
    };

    await this.csvService.parse(filePath, async (row) => {
      stats.totalTransactions += 1;

      const validated = validateCsvRow(row);
      if (!validated.ok) {
        stats.invalid += 1;
        return;
      }

      const tx = this.idempotency.claimAndLock(
        validated.value,
        this.config.maxRetries,
      );
      if (!tx) {
        stats.duplicates += 1;
        return;
      }

      await this.queue.waitForCapacity();
      this.queue.push(() => this.completeProcessing(tx, stats));
    });

    await this.queue.onIdle();

    return {
      message: 'File processed',
      ...stats,
    };
  }

  getById(transactionId: string): Transaction {
    const transaction = this.store.get(transactionId);
    if (!transaction) {
      throw new NotFoundError(
        `Transaction ${transactionId} was not found`,
        'TRANSACTION_NOT_FOUND',
      );
    }
    return transaction;
  }

  async retry(transactionId: string): Promise<Transaction> {
    const tx = this.idempotency.lockForRetry(transactionId);
    await this.queue.run(() => this.completeProcessing(tx));
    return tx;
  }

  private async completeProcessing(
    tx: Transaction,
    stats?: UploadStats,
  ): Promise<void> {
    try {
      await this.processor.process(tx);
      this.stateMachine.transition(tx, TransactionStatus.PROCESSED);
      tx.error = undefined;
      if (stats) {
        stats.processed += 1;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown processing error';
      this.stateMachine.transition(tx, TransactionStatus.FAILED);
      tx.error = message;
      if (stats) {
        stats.failed += 1;
      }
    }
  }
}
