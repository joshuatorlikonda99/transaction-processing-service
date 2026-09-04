# Transaction Processing Service

Node.js/TypeScript service that accepts a CSV of transactions, processes them asynchronously with a **global concurrency limit**, and guarantees **exactly-once processing** per `transactionId`.

The design is built around the Node.js event loop: CSV rows are **streamed** from disk, work is scheduled through a p-limit-style worker pool, and the simulated downstream call is an I/O wait (`setTimeout`) rather than a CPU-bound loop. The HTTP server stays responsive while a file is being processed.

---

## What it does

| Capability | How it is implemented |
| --- | --- |
| Multipart CSV upload | `POST /transactions/upload` via Multer (`file` field) |
| Streaming, non-blocking parse | `csv-parser` over `fs.createReadStream` (row-by-row, never a full-file buffer) |
| Configurable concurrency | `ConcurrencyQueue` worker pool (default **5**). Rows are pushed as they stream — no `Promise.all` on the full file |
| Race-safe idempotency | Synchronous check-and-set: create + mark `PROCESSING` with **no `await` in between** |
| Reusable state machine | `transition(tx, nextState)` is the **only** function that mutates `tx.status` |
| Status API | `GET /transactions/:transactionId` |
| Failed-transaction retry | `POST /transactions/:transactionId/retry` with max retry cap |
| Validation + errors | Row-level CSV validation and a single Express error handler |
| In-memory repository | `Map`-backed store, with a production scaling note below |

---

## Project structure

```text
src/
  api/
    routes/
      transactions.routes.ts
    controllers/
      upload.controller.ts
      status.controller.ts
  services/
    csv.service.ts           # stream-parse CSV
    transaction.service.ts   # orchestration
    processor.service.ts     # simulated external call
  core/
    stateMachine.ts          # transition rules
    concurrencyQueue.ts      # p-limit style worker pool
    idempotencyStore.ts      # dedupe + locking
  store/
    transactionStore.ts      # in-memory Map-based repo
  middleware/
    errorHandler.ts
    validateCsvRow.ts
  app.ts
  server.ts
data/sample.csv
tests/app.test.ts
tests/stateMachine.test.ts
tests/idempotency.test.ts
Dockerfile
```

TypeScript compiles to the same layout under `dist/`.

---

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Then:

```bash
curl -F "file=@data/sample.csv" http://localhost:3000/transactions/upload
curl http://localhost:3000/transactions/txn-001
curl -X POST http://localhost:3000/transactions/txn-003/retry
```

Production-style run:

```bash
npm test
npm run build
npm start
```

Docker:

```bash
docker build -t transaction-processing-service .
docker run --rm -p 3000:3000 transaction-processing-service
```

---

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `CONCURRENCY_LIMIT` | `5` | Max transactions in `PROCESSING` at once |
| `MAX_RETRIES` | `3` | Max successful retry attempts per failed transaction |
| `PROCESS_DELAY_MS` | `80` | Simulated downstream latency |
| `FAILURE_RATE` | `0` | Random failure probability `0..1` |
| `FAIL_USER_ID` | `fail-user` | Deterministic simulated failure (used by `data/sample.csv`) |
| `MAX_FILE_SIZE_MB` | `10` | Upload size cap |
| `MAX_QUEUE_PENDING` | `1000` | Backpressure threshold for the worker pool |

---

## HTTP API

### `POST /transactions/upload`

Multipart field name: **`file`**. Content type: CSV.

Example `data/sample.csv`:

```csv
transactionId,userId,amount
txn-001,user-101,100
txn-002,user-102,250
txn-003,fail-user,500
txn-004,user-104,100
txn-001,user-101,100
txn-005,user-105,abc
txn-006,,75
```

Example response:

```json
{
  "message": "File processed",
  "totalTransactions": 7,
  "processed": 3,
  "failed": 1,
  "duplicates": 1,
  "invalid": 2
}
```

`invalid` covers malformed rows (missing fields, non-numeric or non-positive amount). Those rows never enter the store. `duplicates` are skipped because `transactionId` was already claimed.

The request waits until queued work for **that file** finishes, then returns the summary. Status lookups and health checks remain available on the event loop while processing is in flight.

### `GET /transactions/:transactionId`

```json
{
  "transactionId": "txn-001",
  "userId": "user-101",
  "amount": 100,
  "status": "PROCESSED",
  "retryCount": 0
}
```

Unknown ids return `404` with code `TRANSACTION_NOT_FOUND`.

### `POST /transactions/:transactionId/retry`

Retries **only** `FAILED` transactions, using the bonus transition `FAILED → PROCESSING`. A second retry on a `PROCESSED` record is rejected (`409 RETRY_NOT_ALLOWED`). Exhausting `MAX_RETRIES` returns `409 MAX_RETRIES_EXCEEDED`.

### `GET /health`

Liveness probe used by Docker.

---

## Architecture

```text
CSV stream ──► validate row (no throw)
                 │
                 ├─ invalid  → count and skip
                 └─ valid
                      │
                      ▼
              sync claimAndLock (no await)
                 │
                 ├─ already exists → duplicate
                 └─ create PENDING, immediately PROCESSING
                      │
                      ▼
              concurrency queue.push (limit N)
                      │
                      ▼
              simulated external I/O (random delay)
                 │
                 ├─ success → PROCESSED
                 └─ error   → FAILED  ──retry lock──► PROCESSING
```

### Why this stays non-blocking

- **File I/O is streamed.** Multer writes the upload to a temp file; `csv-parser` reads it as a stream. The CSV is never loaded with `readFileSync` into a string or parsed into one giant array first.
- **The “external API” is I/O-bound.** `ProcessorService` waits with `setTimeout` (a random delay around `PROCESS_DELAY_MS`) then resolves or rejects. That yields back to the event loop. A tight `while` loop or hashing a huge payload would be CPU-bound — that is when you would reach for `worker_threads`. This task does not need them.
- **Concurrency is not parallelism.** Node.js is single-threaded. Five “concurrent” transactions means five overlapping I/O waits, not five CPU cores.
- **Backpressure for large files.** As each row is parsed it is `queue.push`’d. `waitForCapacity()` pauses the parse loop once pending jobs hit `MAX_QUEUE_PENDING`. The upload path waits on `queue.onIdle()` — not `Promise.all(rows.map(...))`.

### State machine

All status changes go through `TransactionStateMachine.transition(tx, nextState)`. That function is the **only** place `tx.status` is assigned after construction. Services never write `tx.status = ...`.

| From | Allowed next states |
| --- | --- |
| `PENDING` | `PROCESSING` |
| `PROCESSING` | `PROCESSED`, `FAILED` |
| `PROCESSED` | _(terminal)_ |
| `FAILED` | `PROCESSING` (retry only) |

Illegal examples that throw `INVALID_STATE_TRANSITION`: `PROCESSED → PROCESSING`, `FAILED → PROCESSED`.

### Idempotency and races

`transactionId` is the store key and the idempotency key. Duplicates can appear:

1. twice in the same CSV
2. across two uploads
3. in two HTTP requests that overlap

`IdempotencyStore.claimAndLock()` does a **synchronous** check-and-set:

1. `store.exists(id)`?
2. if not, `store.create(...)` (`PENDING`)
3. `stateMachine.transition(tx, PROCESSING)`

There is **no `await` between those steps**. Because the Node event loop is single-threaded, another request handler cannot run until this function returns. That is the JS-native atomic lock; it covers in-file duplicates, later uploads, and concurrent API calls for the same id.

Retry uses the same trick: `lockForRetry()` checks `FAILED`, increments `retryCount`, and transitions to `PROCESSING` in one tick, then the I/O runs on the queue.

This lock is **not** valid across multiple Node processes — see production notes below (`Redis SETNX` / DB unique constraint).

### In-memory store vs production (multiple Node processes)

This assessment uses a process-local `Map`. That is correct for a single instance and makes the race/idempotency behaviour easy to reason about. It is **not** enough once you run more than one Node.js process.

| Concern | This project | Production change |
| --- | --- | --- |
| Transaction records | `Map` in one process | PostgreSQL (unique index on `transactionId`) or another shared DB |
| Idempotency / locking | sync in-process check-and-set | Redis `SET key NX PX …` (`SETNX`) or a DB unique constraint on `transactionId` |
| Concurrency limit | in-process counter | Redis semaphore / BullMQ `limiter` shared across workers |
| CSV bytes | local temp file | S3/GCS + stream from object storage |
| Work distribution | same process that accepted the upload | enqueue a job per file (or per chunk) onto a queue; workers pull work |
| Retry | HTTP endpoint | delayed queue jobs with backoff and a dead-letter queue |
| Observability | `console.error` | structured logs, metrics for queue depth / processing latency / failure rate |

A realistic production cut would look like: API process stores the file, inserts rows with `ON CONFLICT DO NOTHING`, and publishes jobs. Workers take jobs under a distributed lock. The state machine stays the same — only the store and lock implementations change.

---

## Design trade-offs

- **Upload is synchronous from the client’s point of view** (it returns counts). That matches the assessment example. A `202 Accepted` + job id would scale better for multi-hundred-MB files; the internals already support that split because processing is queued.
- **Failed rows in a file do not fail the whole request.** Invalid records are counted; valid ones still run. A stricter “all or nothing” import would need a staging table and a commit step.
- **Random `FAILURE_RATE` defaults to 0** so demos and tests are deterministic. `data/sample.csv` uses `fail-user` for a guaranteed failure you can retry.

---

## Tests

Highest-value unit tests sit next to the two trickiest modules:

- `tests/stateMachine.test.ts` — legal / illegal transitions, `InvalidTransitionError`, status mutation
- `tests/idempotency.test.ts` — in-file duplicates, later claims, sync race, retry lock, maxRetries
- `tests/concurrency.test.ts` — worker pool never exceeds `CONCURRENCY_LIMIT`
- `tests/app.test.ts` — upload, validation, concurrent HTTP, status, retry

```bash
npm test
```

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Watch mode via `tsx` |
| `npm test` | Jest + ts-jest, run in band |
| `npm run build` | Strict TypeScript compile to `dist/` |
| `npm start` | Run compiled `dist/server.js` |
