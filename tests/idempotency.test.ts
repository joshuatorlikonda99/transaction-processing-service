import { AppError, NotFoundError } from '../src/core/appError';
import { IdempotencyStore } from '../src/core/idempotencyStore';
import { TransactionStateMachine } from '../src/core/stateMachine';
import { TransactionStore } from '../src/store/transactionStore';
import { TransactionStatus } from '../src/types/transaction';

function buildIdempotency() {
  const store = new TransactionStore();
  const stateMachine = new TransactionStateMachine();
  const idempotency = new IdempotencyStore(store, stateMachine);
  return { store, stateMachine, idempotency };
}

describe('IdempotencyStore', () => {
  it('claims a new transactionId and marks PROCESSING in one synchronous step', () => {
    const { store, idempotency } = buildIdempotency();

    const tx = idempotency.claimAndLock(
      { transactionId: 'txn-1', userId: 'user-1', amount: 10 },
      3,
    );

    expect(tx).not.toBeNull();
    expect(tx?.status).toBe(TransactionStatus.PROCESSING);
    expect(store.get('txn-1')?.status).toBe(TransactionStatus.PROCESSING);
  });

  it('skips duplicates in-file and across later claims', () => {
    const { idempotency } = buildIdempotency();
    const input = { transactionId: 'txn-dup', userId: 'user-1', amount: 10 };

    const first = idempotency.claimAndLock(input, 3);
    const second = idempotency.claimAndLock({ ...input, amount: 99 }, 3);
    const third = idempotency.claimAndLock(input, 3);

    expect(first?.amount).toBe(10);
    expect(second).toBeNull();
    expect(third).toBeNull();
  });

  it('wins a race because check-and-set has no await', () => {
    const { store, idempotency } = buildIdempotency();
    const input = { transactionId: 'txn-race', userId: 'user-1', amount: 10 };

    const claims = [
      idempotency.claimAndLock(input, 3),
      idempotency.claimAndLock(input, 3),
      idempotency.claimAndLock(input, 3),
    ];

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(store.size()).toBe(1);
  });

  it('locks a FAILED transaction for retry and rejects non-retryable states', () => {
    const { store, stateMachine, idempotency } = buildIdempotency();
    const tx = idempotency.claimAndLock(
      { transactionId: 'txn-fail', userId: 'user-1', amount: 10 },
      1,
    );
    expect(tx).not.toBeNull();
    stateMachine.transition(tx!, TransactionStatus.FAILED);

    const locked = idempotency.lockForRetry('txn-fail');
    expect(locked.status).toBe(TransactionStatus.PROCESSING);
    expect(locked.retryCount).toBe(1);
    expect(store.get('txn-fail')?.retryCount).toBe(1);

    stateMachine.transition(locked, TransactionStatus.PROCESSED);
    expect(() => idempotency.lockForRetry('txn-fail')).toThrow(AppError);

    expect(() => idempotency.lockForRetry('missing')).toThrow(NotFoundError);
  });

  it('rejects retry once maxRetries is exhausted', () => {
    const { stateMachine, idempotency } = buildIdempotency();
    const tx = idempotency.claimAndLock(
      { transactionId: 'txn-max', userId: 'user-1', amount: 10 },
      1,
    );
    stateMachine.transition(tx!, TransactionStatus.FAILED);
    idempotency.lockForRetry('txn-max');
    stateMachine.transition(tx!, TransactionStatus.FAILED);

    expect(() => idempotency.lockForRetry('txn-max')).toThrow(/retried/);
  });
});
