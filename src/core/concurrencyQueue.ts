type Job = () => Promise<void> | void;

export class ConcurrencyQueue {
  private active = 0;
  private readonly pending: Job[] = [];
  private readonly capacityWaiters: Array<() => void> = [];
  private readonly idleWaiters: Array<() => void> = [];

  constructor(
    private readonly concurrency: number,
    private readonly maxPending = 1000,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('concurrency must be an integer >= 1');
    }
    if (!Number.isInteger(maxPending) || maxPending < 1) {
      throw new Error('maxPending must be an integer >= 1');
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  async waitForCapacity(): Promise<void> {
    if (this.pending.length < this.maxPending) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.capacityWaiters.push(resolve);
    });
  }

  push(fn: Job): void {
    this.pending.push(fn);
    this.pump();
  }

  run(fn: Job): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.pending.push(async () => {
        try {
          await fn();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      this.pump();
    });
  }

  async onIdle(): Promise<void> {
    if (this.active === 0 && this.pending.length === 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      if (!job) {
        return;
      }

      const waiter = this.capacityWaiters.shift();
      waiter?.();

      this.active += 1;
      void this.runJob(job);
    }
  }

  private async runJob(job: Job): Promise<void> {
    try {
      await job();
    } finally {
      this.active -= 1;
      if (this.active === 0 && this.pending.length === 0) {
        while (this.idleWaiters.length > 0) {
          const notify = this.idleWaiters.shift();
          notify?.();
        }
      }
      this.pump();
    }
  }
}
