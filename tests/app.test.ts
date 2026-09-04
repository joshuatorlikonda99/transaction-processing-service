import request from 'supertest';
import { createApp } from '../src/app';
import { ProcessorService } from '../src/services/processor.service';
import { TransactionStatus } from '../src/types/transaction';
import { testConfig } from './helpers';

function csvBuffer(rows: string[]): Buffer {
  return Buffer.from(['transactionId,userId,amount', ...rows].join('\n'));
}

function buildApp(processor?: ProcessorService) {
  return createApp({
    config: { ...testConfig },
    processor:
      processor ??
      new ProcessorService({
        delayMs: testConfig.processDelayMs,
        failureRate: 0,
      }),
  });
}

describe('Transaction processing API', () => {
  it('processes a valid CSV upload and reports a summary', async () => {
    const { app } = buildApp();
    const file = csvBuffer([
      'txn-001,user-101,100',
      'txn-002,user-102,250',
      'txn-003,user-103,500',
    ]);

    const response = await request(app)
      .post('/transactions/upload')
      .attach('file', file, 'transactions.csv')
      .expect(200);

    expect(response.body).toMatchObject({
      message: 'File processed',
      totalTransactions: 3,
      processed: 3,
      failed: 0,
      duplicates: 0,
      invalid: 0,
    });
  });

  it('rejects an upload when no file is provided or the file is not CSV', async () => {
    const { app } = buildApp();

    const missing = await request(app)
      .post('/transactions/upload')
      .expect(400);
    expect(missing.body.error.code).toBe('FILE_REQUIRED');

    const invalidType = await request(app)
      .post('/transactions/upload')
      .attach('file', Buffer.from('not a csv'), 'notes.txt')
      .expect(400);
    expect(invalidType.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('skips invalid rows and continues processing valid ones', async () => {
    const { app } = buildApp();
    const file = csvBuffer([
      'txn-ok,user-1,10',
      ',user-2,10',
      'txn-bad-amount,user-3,abc',
      'txn-negative,user-4,-5',
    ]);

    const response = await request(app)
      .post('/transactions/upload')
      .attach('file', file, 'mixed.csv')
      .expect(200);

    expect(response.body).toMatchObject({
      totalTransactions: 4,
      processed: 1,
      failed: 0,
      duplicates: 0,
      invalid: 3,
    });

    const status = await request(app).get('/transactions/txn-ok').expect(200);
    expect(status.body.status).toBe(TransactionStatus.PROCESSED);
  });

  it('treats duplicate transactionIds as idempotent within and across uploads', async () => {
    const { app } = buildApp();
    const file = csvBuffer([
      'txn-dup,user-1,10',
      'txn-dup,user-1,99',
      'txn-unique,user-2,20',
    ]);

    const first = await request(app)
      .post('/transactions/upload')
      .attach('file', file, 'first.csv')
      .expect(200);

    expect(first.body).toMatchObject({
      totalTransactions: 3,
      processed: 2,
      duplicates: 1,
      invalid: 0,
    });

    const second = await request(app)
      .post('/transactions/upload')
      .attach('file', file, 'second.csv')
      .expect(200);

    expect(second.body).toMatchObject({
      processed: 0,
      duplicates: 3,
      invalid: 0,
    });

    const original = await request(app).get('/transactions/txn-dup').expect(200);
    expect(original.body).toMatchObject({
      amount: 10,
      status: TransactionStatus.PROCESSED,
    });
  });

  it('prevents double-processing when concurrent uploads share a transactionId', async () => {
    const { app } = buildApp(
      new ProcessorService({ delayMs: 40, failureRate: 0 }),
    );
    const file = csvBuffer(['txn-race,user-1,10']);

    const [first, second] = await Promise.all([
      request(app)
        .post('/transactions/upload')
        .attach('file', file, 'a.csv'),
      request(app)
        .post('/transactions/upload')
        .attach('file', file, 'b.csv'),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    expect(first.body.processed + second.body.processed).toBe(1);
    expect(first.body.duplicates + second.body.duplicates).toBe(1);

    const status = await request(app).get('/transactions/txn-race').expect(200);
    expect(status.body.status).toBe(TransactionStatus.PROCESSED);
  });

  it('returns the current transaction status by id', async () => {
    const { app } = buildApp();
    const file = csvBuffer(['txn-status,user-9,42']);

    await request(app)
      .post('/transactions/upload')
      .attach('file', file, 'status.csv')
      .expect(200);

    const found = await request(app)
      .get('/transactions/txn-status')
      .expect(200);
    expect(found.body).toMatchObject({
      transactionId: 'txn-status',
      userId: 'user-9',
      amount: 42,
      status: TransactionStatus.PROCESSED,
    });

    const missing = await request(app)
      .get('/transactions/does-not-exist')
      .expect(404);
    expect(missing.body.error.code).toBe('TRANSACTION_NOT_FOUND');
  });

  it('retries a failed transaction until it succeeds', async () => {
    const failIds = new Set(['txn-fail']);
    const { app } = buildApp(
      new ProcessorService({ delayMs: 10, failureRate: 0, failIds }),
    );
    const file = csvBuffer(['txn-fail,user-1,10']);

    const upload = await request(app)
      .post('/transactions/upload')
      .attach('file', file, 'fail.csv')
      .expect(200);
    expect(upload.body).toMatchObject({ processed: 0, failed: 1 });

    const failed = await request(app).get('/transactions/txn-fail').expect(200);
    expect(failed.body.status).toBe(TransactionStatus.FAILED);

    const blocked = await request(app)
      .post('/transactions/txn-status-missing/retry')
      .expect(404);
    expect(blocked.body.error.code).toBe('TRANSACTION_NOT_FOUND');

    failIds.delete('txn-fail');

    const retry = await request(app)
      .post('/transactions/txn-fail/retry')
      .expect(200);
    expect(retry.body).toMatchObject({
      message: 'Retry completed',
      transactionId: 'txn-fail',
      status: TransactionStatus.PROCESSED,
      retryCount: 1,
    });

    const processed = await request(app)
      .post('/transactions/txn-fail/retry')
      .expect(409);
    expect(processed.body.error.code).toBe('RETRY_NOT_ALLOWED');
  });
});
