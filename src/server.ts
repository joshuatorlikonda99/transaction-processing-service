import dotenv from 'dotenv';
import { createApp } from './app';
import { loadConfig } from './config';

dotenv.config();

const config = loadConfig();
const { app } = createApp({ config });

const server = app.listen(config.port, () => {
  console.log(
    `Transaction processing service listening on http://localhost:${config.port}`,
  );
  console.log(
    `Concurrency limit=${config.concurrencyLimit} maxRetries=${config.maxRetries} delayMs=${config.processDelayMs}`,
  );
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${config.port} is already in use. Stop the other process, or set PORT to a free port.`,
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
