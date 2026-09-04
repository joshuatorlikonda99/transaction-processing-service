import express, { Express } from 'express';
import { AppConfig, loadConfig } from './config';
import { createTransactionRouter } from './api/routes/transactions.routes';
import { ConcurrencyQueue } from './core/concurrencyQueue';
import { IdempotencyStore } from './core/idempotencyStore';
import { TransactionStateMachine } from './core/stateMachine';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { CsvService } from './services/csv.service';
import { ProcessorService } from './services/processor.service';
import { TransactionService } from './services/transaction.service';
import { TransactionStore } from './store/transactionStore';

export interface AppDependencies {
  config?: AppConfig;
  store?: TransactionStore;
  processor?: ProcessorService;
  queue?: ConcurrencyQueue;
  idempotency?: IdempotencyStore;
  csvService?: CsvService;
  stateMachine?: TransactionStateMachine;
}

export interface CreatedApp {
  app: Express;
  store: TransactionStore;
  queue: ConcurrencyQueue;
  processor: ProcessorService;
  transactionService: TransactionService;
}

export function createApp(overrides: AppDependencies = {}): CreatedApp {
  const config = overrides.config ?? loadConfig();
  const store = overrides.store ?? new TransactionStore();
  const processor =
    overrides.processor ??
    new ProcessorService({
      delayMs: config.processDelayMs,
      failureRate: config.failureRate,
      failUserId: config.failUserId,
    });
  const queue =
    overrides.queue ??
    new ConcurrencyQueue(config.concurrencyLimit, config.maxQueuePending);
  const csvService = overrides.csvService ?? new CsvService();
  const stateMachine = overrides.stateMachine ?? new TransactionStateMachine();
  const idempotency =
    overrides.idempotency ?? new IdempotencyStore(store, stateMachine);

  const transactionService = new TransactionService(
    store,
    csvService,
    processor,
    queue,
    idempotency,
    stateMachine,
    config,
  );

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/transactions', createTransactionRouter(transactionService, config));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, store, queue, processor, transactionService };
}
