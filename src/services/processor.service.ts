import { Transaction } from '../types/transaction';

export interface ProcessorOptions {
  delayMs: number;
  failureRate: number;
  failUserId?: string;
  failIds?: Set<string>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class ProcessorService {
  constructor(private readonly options: ProcessorOptions) {}

  async process(
    transaction: Pick<
      Transaction,
      'transactionId' | 'userId' | 'amount' | 'retryCount'
    >,
  ): Promise<void> {
    const waitMs =
      this.options.delayMs <= 0
        ? 0
        : Math.floor(this.options.delayMs * (0.5 + Math.random()));
    if (waitMs > 0) {
      await delay(waitMs);
    }

    if (this.options.failIds?.has(transaction.transactionId)) {
      throw new Error('Simulated external API failure');
    }

    if (
      this.options.failUserId &&
      transaction.userId === this.options.failUserId &&
      transaction.retryCount === 0
    ) {
      throw new Error('Simulated external API failure');
    }

    if (
      this.options.failureRate > 0 &&
      Math.random() < this.options.failureRate
    ) {
      throw new Error('Simulated external API failure');
    }
  }
}
