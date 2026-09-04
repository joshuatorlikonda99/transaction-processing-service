import { InvalidTransitionError } from './appError';
import { Transaction, TransactionStatus } from '../types/transaction';

export const TRANSITIONS: Record<TransactionStatus, readonly TransactionStatus[]> = {
  PENDING: ['PROCESSING'],
  PROCESSING: ['PROCESSED', 'FAILED'],
  PROCESSED: [],
  FAILED: ['PROCESSING'],
};

export class TransactionStateMachine {
  canTransition(from: TransactionStatus, to: TransactionStatus): boolean {
    return TRANSITIONS[from].includes(to);
  }

  allowedTargets(from: TransactionStatus): readonly TransactionStatus[] {
    return TRANSITIONS[from];
  }

  /**
   * The only function in the codebase that mutates `tx.status`.
   */
  transition(tx: Transaction, nextState: TransactionStatus): Transaction {
    if (!this.canTransition(tx.status, nextState)) {
      throw new InvalidTransitionError(
        tx.status,
        nextState,
        this.allowedTargets(tx.status),
      );
    }
    tx.status = nextState;
    tx.updatedAt = new Date();
    return tx;
  }
}
