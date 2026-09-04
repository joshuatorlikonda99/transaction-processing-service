import { ConcurrencyQueue } from '../src/core/concurrencyQueue';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('ConcurrencyQueue', () => {
  it('never runs more jobs than the configured limit', async () => {
    const limit = 3;
    const queue = new ConcurrencyQueue(limit);
    let current = 0;
    let peak = 0;

    const jobs = Array.from({ length: 12 }, () =>
      queue.run(async () => {
        current += 1;
        peak = Math.max(peak, current);
        await delay(25);
        current -= 1;
      }),
    );

    await Promise.all(jobs);

    expect(peak).toBeLessThanOrEqual(limit);
    expect(peak).toBe(limit);
    expect(queue.activeCount).toBe(0);
    expect(queue.pendingCount).toBe(0);
  });
});
