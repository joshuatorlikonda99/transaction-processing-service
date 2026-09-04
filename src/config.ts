export interface AppConfig {
  port: number;
  concurrencyLimit: number;
  maxRetries: number;
  processDelayMs: number;
  failureRate: number;
  failUserId?: string;
  maxFileSizeBytes: number;
  maxQueuePending: number;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${name} must be a finite number`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  const failureRate = readNumber('FAILURE_RATE', 0);
  if (failureRate < 0 || failureRate > 1) {
    throw new Error('FAILURE_RATE must be between 0 and 1');
  }

  const failUserId = process.env.FAIL_USER_ID ?? 'fail-user';
  const maxFileSizeMb = readNumber('MAX_FILE_SIZE_MB', 10);

  return {
    port: readNumber('PORT', 3000),
    concurrencyLimit: Math.max(1, readNumber('CONCURRENCY_LIMIT', 5)),
    maxRetries: Math.max(0, readNumber('MAX_RETRIES', 3)),
    processDelayMs: Math.max(0, readNumber('PROCESS_DELAY_MS', 80)),
    failureRate,
    failUserId: failUserId.length > 0 ? failUserId : undefined,
    maxFileSizeBytes: Math.max(1, maxFileSizeMb) * 1024 * 1024,
    maxQueuePending: Math.max(1, readNumber('MAX_QUEUE_PENDING', 1000)),
  };
}
