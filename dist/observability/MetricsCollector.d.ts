import type { Logger } from './Logger';
export interface MetricsConfig {
    enabled?: boolean;
    port?: number;
    path?: string;
}
export declare class MetricsCollector {
    private registry;
    private counters;
    private histograms;
    private gauges;
    private server?;
    private logger?;
    constructor(config?: MetricsConfig, logger?: Logger);
    private initializeMetrics;
    incrementCounter(name: string, labels: Record<string, string | number>): void;
    recordLatency(name: string, durationMs: number, labels: Record<string, string | number>): void;
    recordGauge(name: string, value: number, labels: Record<string, string | number>): void;
    getMetrics(): Promise<string>;
    private exposeMetrics;
    private tryNextPort;
    close(): Promise<void>;
}
//# sourceMappingURL=MetricsCollector.d.ts.map