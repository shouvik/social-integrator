"use strict";
// src/observability/Logger.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const winston_1 = __importDefault(require("winston"));
class Logger {
    logger;
    constructor(config = {}) {
        const format = config.format === 'pretty'
            ? winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
            : winston_1.default.format.json();
        this.logger = winston_1.default.createLogger({
            level: config.level ?? 'info',
            format,
            transports: [new winston_1.default.transports.Console()],
        });
    }
    redactSensitive(obj) {
        if (!obj || typeof obj !== 'object')
            return obj;
        const redacted = { ...obj };
        // Redact token fields
        if ('accessToken' in redacted)
            redacted.accessToken = '[REDACTED]';
        if ('refreshToken' in redacted)
            redacted.refreshToken = '[REDACTED]';
        if ('idToken' in redacted)
            redacted.idToken = '[REDACTED]';
        // Redact secret fields
        if ('clientSecret' in redacted)
            redacted.clientSecret = '[REDACTED]';
        if ('consumerSecret' in redacted)
            redacted.consumerSecret = '[REDACTED]';
        if ('tokenSecret' in redacted)
            redacted.tokenSecret = '[REDACTED]';
        // Redact nested tokenSet
        if ('tokenSet' in redacted && redacted.tokenSet && typeof redacted.tokenSet === 'object') {
            const tokenSet = redacted.tokenSet;
            if ('accessToken' in tokenSet)
                tokenSet.accessToken = '[REDACTED]';
            if ('refreshToken' in tokenSet)
                tokenSet.refreshToken = '[REDACTED]';
            if ('idToken' in tokenSet)
                tokenSet.idToken = '[REDACTED]';
        }
        return redacted;
    }
    debug(message, meta) {
        const sanitized = meta ? this.redactSensitive(meta) : {};
        this.logger.debug(message, sanitized);
    }
    info(message, meta) {
        const sanitized = meta ? this.redactSensitive(meta) : {};
        this.logger.info(message, sanitized);
    }
    warn(message, meta) {
        const sanitized = meta ? this.redactSensitive(meta) : {};
        this.logger.warn(message, sanitized);
    }
    error(message, meta) {
        const sanitized = meta ? this.redactSensitive(meta) : {};
        this.logger.error(message, sanitized);
    }
    // Test compatibility method - delegates to winston logger
    log(level, message, meta) {
        const sanitized = meta ? this.redactSensitive(meta) : {};
        this.logger.log(level, message, sanitized);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=Logger.js.map