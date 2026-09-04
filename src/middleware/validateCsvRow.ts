import { NewTransaction } from '../types/transaction';

export type CsvRow = Record<string, string | undefined>;

export type RowValidationResult =
  | { ok: true; value: NewTransaction }
  | { ok: false; error: string };

function readField(row: CsvRow, name: string): string {
  const direct = row[name];
  if (typeof direct === 'string') {
    return direct;
  }

  const match = Object.keys(row).find(
    (key) => key.trim().toLowerCase() === name.toLowerCase(),
  );
  return match ? (row[match] ?? '') : '';
}

export function validateCsvRow(row: CsvRow): RowValidationResult {
  const transactionId = readField(row, 'transactionId').trim();
  const userId = readField(row, 'userId').trim();
  const amountRaw = readField(row, 'amount').trim();

  if (!transactionId) {
    return { ok: false, error: 'transactionId is required' };
  }
  if (transactionId.length > 128) {
    return { ok: false, error: 'transactionId exceeds 128 characters' };
  }
  if (!userId) {
    return { ok: false, error: 'userId is required' };
  }
  if (userId.length > 128) {
    return { ok: false, error: 'userId exceeds 128 characters' };
  }
  if (!amountRaw) {
    return { ok: false, error: 'amount is required' };
  }

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount)) {
    return { ok: false, error: 'amount must be a valid number' };
  }
  if (amount <= 0) {
    return { ok: false, error: 'amount must be greater than 0' };
  }

  return {
    ok: true,
    value: { transactionId, userId, amount },
  };
}
