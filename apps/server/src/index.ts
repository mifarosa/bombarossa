import { startServer } from './server.js';

const port = Number(process.env.PORT ?? 8080);

const server = await startServer({
  port,
  trustProxy: process.env.TRUST_PROXY === '1',
  maxRooms: process.env.MAX_ROOMS ? Number(process.env.MAX_ROOMS) : undefined,
  log: (m) => console.log(`[${new Date().toISOString()}] ${m}`),
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`${sig} received, shutting down`);
    server.close().finally(() => process.exit(0));
  });
}
