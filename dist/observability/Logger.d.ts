export interface LoggerConfig {
    level?: 'debug' | 'info' | 'warn' | 'error';
    format?: 'json' | 'pretty';
}
export declare class Logger {
    private logger;
    constructor(config?: LoggerConfig);
    private redactSensitive;
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
    log(level: string, message: string, meta?: Record<string, unknown>): void;
}
//# sourceMappingURL=Logger.d.ts.map