export const TransactionStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
} as const;

export type TransactionStatus =
  (typeof TransactionStatus)[keyof typeof TransactionStatus];

export interface Transaction {
  transactionId: string;
  userId: string;
  amount: number;
  status: TransactionStatus;
  retryCount: number;
  maxRetries: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTransaction {
  transactionId: string;
  userId: string;
  amount: number;
}

export interface UploadSummary {
  message: string;
  totalTransactions: number;
  processed: number;
  failed: number;
  duplicates: number;
  invalid: number;
}

export interface UploadStats {
  totalTransactions: number;
  processed: number;
  failed: number;
  duplicates: number;
  invalid: number;
}
