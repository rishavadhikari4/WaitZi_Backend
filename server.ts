// server.ts
import http from 'node:http';

import app from './src/app.js';
import config from './src/config/config.js';
import { connectDB, disconnectDB } from './src/config/prisma.js';

process.on('uncaughtException', (err: Error) => {
  console.error(`Uncaught exception: ${err.message}`);
  process.exit(1);
});

await connectDB();

const server = http.createServer(app);
server.listen(config.app.port, '0.0.0.0');

server.on('listening', () => {
  console.log(`🚀 WaitZi API on http://localhost:${config.app.port} (${config.app.env})`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${config.app.port} is already in use.`);
  else console.error('Server failed to start:', err);
  process.exit(1);
});

async function gracefulShutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`);
  server.close(async () => {
    await disconnectDB().catch((err) => console.error('[Shutdown] DB disconnect failed:', err));
    process.exit(0);
  });
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (err: Error) => {
  console.error(`Unhandled rejection: ${err.message}`);
  server.close(() => process.exit(1));
});
