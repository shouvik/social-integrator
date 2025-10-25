// src/observability/Logger.ts

import winston from 'winston';

export interface LoggerConfig {
  level?: 'debug' | 'info' | 'warn' | 'error';
  format?: 'json' | 'pretty';
}

export class Logger {
  private logger: winston.Logger;

  constructor(config: LoggerConfig = {}) {
    const format =
      config.format === 'pretty'
        ? winston.format.combine(winston.format.colorize(), winston.format.simple())
        : winston.format.json();

    this.logger = winston.createLogger({
      level: config.level ?? 'info',
      format,
      transports: [new winston.transports.Console()],
    });
  }

  private redactSensitive(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;

    const redacted = { ...(obj as Record<string, unknown>) };

    // Redact token fields
    if ('accessToken' in redacted) redacted.accessToken = '[REDACTED]';
    if ('refreshToken' in redacted) redacted.refreshToken = '[REDACTED]';
    if ('idToken' in redacted) redacted.idToken = '[REDACTED]';

    // Redact secret fields
    if ('clientSecret' in redacted) redacted.clientSecret = '[REDACTED]';
    if ('consumerSecret' in redacted) redacted.consumerSecret = '[REDACTED]';
    if ('tokenSecret' in redacted) redacted.tokenSecret = '[REDACTED]';

    // Redact nested tokenSet
    if ('tokenSet' in redacted && redacted.tokenSet && typeof redacted.tokenSet === 'object') {
      const tokenSet = redacted.tokenSet as Record<string, unknown>;
      if ('accessToken' in tokenSet) tokenSet.accessToken = '[REDACTED]';
      if ('refreshToken' in tokenSet) tokenSet.refreshToken = '[REDACTED]';
      if ('idToken' in tokenSet) tokenSet.idToken = '[REDACTED]';
    }

    return redacted;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    const sanitized = meta ? this.redactSensitive(meta) : {};
    this.logger.debug(message, sanitized);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    const sanitized = meta ? this.redactSensitive(meta) : {};
    this.logger.info(message, sanitized);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    const sanitized = meta ? this.redactSensitive(meta) : {};
    this.logger.warn(message, sanitized);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    const sanitized = meta ? this.redactSensitive(meta) : {};
    this.logger.error(message, sanitized);
  }

  // Test compatibility method - delegates to winston logger
  log(level: string, message: string, meta?: Record<string, unknown>): void {
    const sanitized = meta ? this.redactSensitive(meta) : {};
    this.logger.log(level, message, sanitized);
  }
}
