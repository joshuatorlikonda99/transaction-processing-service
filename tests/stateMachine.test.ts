import { InvalidTransitionError } from '../src/core/appError';
import { TRANSITIONS, TransactionStateMachine } from '../src/core/stateMachine';
import { TransactionStatus } from '../src/types/transaction';
import { makeTransaction } from './helpers';

describe('TransactionStateMachine', () => {
  const machine = new TransactionStateMachine();

  it('exposes the explicit transition map', () => {
    expect(TRANSITIONS).toEqual({
      PENDING: ['PROCESSING'],
      PROCESSING: ['PROCESSED', 'FAILED'],
      PROCESSED: [],
      FAILED: ['PROCESSING'],
    });
  });

  it('is the only function that mutates tx.status for legal transitions', () => {
    const tx = makeTransaction({ status: TransactionStatus.PENDING });

    machine.transition(tx, TransactionStatus.PROCESSING);
    expect(tx.status).toBe(TransactionStatus.PROCESSING);

    machine.transition(tx, TransactionStatus.PROCESSED);
    expect(tx.status).toBe(TransactionStatus.PROCESSED);
  });

  it('allows PROCESSING → FAILED and FAILED → PROCESSING for retry', () => {
    const tx = makeTransaction({ status: TransactionStatus.PROCESSING });

    machine.transition(tx, TransactionStatus.FAILED);
    expect(tx.status).toBe(TransactionStatus.FAILED);

    machine.transition(tx, TransactionStatus.PROCESSING);
    expect(tx.status).toBe(TransactionStatus.PROCESSING);
  });

  it('rejects illegal transitions with InvalidTransitionError', () => {
    const processed = makeTransaction({ status: TransactionStatus.PROCESSED });
    expect(() =>
      machine.transition(processed, TransactionStatus.PROCESSING),
    ).toThrow(InvalidTransitionError);

    const failed = makeTransaction({ status: TransactionStatus.FAILED });
    expect(() =>
      machine.transition(failed, TransactionStatus.PROCESSED),
    ).toThrow(InvalidTransitionError);

    expect(
      machine.canTransition(
        TransactionStatus.PROCESSED,
        TransactionStatus.FAILED,
      ),
    ).toBe(false);
  });
});
