/**
 * Background job worker for epatang ERP.
 *
 * Lazily loads bullmq + ioredis so `npm run dev` keeps working even when the
 * worker's optional dependencies (or Redis itself) aren't installed/running.
 * It retries periodically instead of crashing the dev process.
 */

const RETRY_INTERVAL_MS = 30_000;
const QUEUE_NAMES = ['email', 'notifications', 'reports', 'automation'];

let started = false;

async function tryStart() {
  if (started) return;

  let bullmq: any;
  let IORedis: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    bullmq = require('bullmq');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    IORedis = require('ioredis');
  } catch {
    console.log(
      '[worker] bullmq/ioredis not installed — run `npm install` in apps/worker. Retrying in 30s...',
    );
    setTimeout(tryStart, RETRY_INTERVAL_MS);
    return;
  }

  const connection = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => Math.min(times * 2000, 30000),
  });

  let redisErrorLogged = false;
  connection.on('error', (err: Error) => {
    if (!redisErrorLogged) {
      redisErrorLogged = true;
      console.error(
        `[worker] Redis connection error${err.message ? `: ${err.message}` : ''} — is Redis running? Will keep retrying quietly.`,
      );
    }
  });

  connection.once('ready', () => {
    console.log('[worker] Redis connected');
  });

  const { Queue, Worker } = bullmq;
  const workers: any[] = [];
  const queues: any[] = [];

  for (const name of QUEUE_NAMES) {
    const queue = new Queue(name, { connection });
    queues.push(queue);

    const worker = new Worker(
      name,
      async (job: any) => {
        console.log(`[worker] Processing ${name} job ${job.id} (${job.name})`);
        switch (job.name) {
          default:
            console.log(`[worker] No handler for job "${job.name}", acking`);
        }
        return { processed: true };
      },
      { connection, concurrency: 5 },
    );

    worker.on('completed', (job: any) => {
      console.log(`[worker] ${name} job ${job.id} completed`);
    });

    worker.on('failed', (job: any, err: Error) => {
      console.error(`[worker] ${name} job ${job?.id} failed:`, err.message);
    });

    let workerErrorLogged = false;
    worker.on('error', () => {
      if (!workerErrorLogged) {
        workerErrorLogged = true;
        console.error(`[worker] ${name} worker offline — waiting for Redis`);
      }
    });

    workers.push(worker);
  }

  started = true;
  console.log(`[worker] Started ${workers.length} queue workers`);

  const shutdown = async () => {
    console.log('[worker] Shutting down...');
    await Promise.allSettled(workers.map((w) => w.close()));
    await Promise.allSettled(queues.map((q) => q.close()));
    connection.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

console.log('[worker] Starting background job worker...');
tryStart().catch((err) => {
  console.error('[worker] Startup error:', err);
  setTimeout(tryStart, RETRY_INTERVAL_MS);
});
