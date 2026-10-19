// src/app.ts
import cookieParser from 'cookie-parser';
import express from 'express';

import config from './config/config.js';
import { corsMiddleware } from './headers/cors.middleware.js';
import { helmetMiddleware } from './middleware/security.middleware.js';
import indexRoutes from './routes/index.routes.js';
import { errorHandler, notFoundHandler } from './sanitization/errorHandler.middleware.js';
import './Interface/GlobalInterface.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.app.trustProxy);

app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api', indexRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
