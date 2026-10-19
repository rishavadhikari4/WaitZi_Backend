// src/utils/logger.ts
// ponytail: console transport only; add winston-daily-rotate-file like NestSMS
// when the server writes logs to disk instead of the host's log collector.
import winston from 'winston';

import config from '../config/config.js';

export const logger = winston.createLogger({
  level: config.app.isProduction ? 'info' : 'debug',
  silent: config.app.env === 'test' && !process.env['LOG_IN_TESTS'],
  format: winston.format.combine(
    winston.format.timestamp(),
    config.app.isProduction
      ? winston.format.json()
      : winston.format.printf(({ timestamp, level, message, ...meta }) =>
          `${timestamp} ${level}: ${message}${Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''}`,
        ),
  ),
  transports: [new winston.transports.Console()],
});
