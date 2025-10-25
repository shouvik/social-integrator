import { z } from 'zod';
export declare const InitConfigSchema: z.ZodObject<{
    tokenStore: z.ZodEffects<z.ZodObject<{
        backend: z.ZodEnum<["memory", "redis", "postgres"]>;
        url: z.ZodOptional<z.ZodString>;
        encryption: z.ZodOptional<z.ZodObject<{
            key: z.ZodString;
            algorithm: z.ZodLiteral<"aes-256-gcm">;
        }, "strip", z.ZodTypeAny, {
            key: string;
            algorithm: "aes-256-gcm";
        }, {
            key: string;
            algorithm: "aes-256-gcm";
        }>>;
        ttl: z.ZodOptional<z.ZodNumber>;
        preRefreshMarginMinutes: z.ZodOptional<z.ZodNumber>;
        expiredTokenBufferMinutes: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        backend: "memory" | "redis" | "postgres";
        url?: string | undefined;
        ttl?: number | undefined;
        encryption?: {
            key: string;
            algorithm: "aes-256-gcm";
        } | undefined;
        preRefreshMarginMinutes?: number | undefined;
        expiredTokenBufferMinutes?: number | undefined;
    }, {
        backend: "memory" | "redis" | "postgres";
        url?: string | undefined;
        ttl?: number | undefined;
        encryption?: {
            key: string;
            algorithm: "aes-256-gcm";
        } | undefined;
        preRefreshMarginMinutes?: number | undefined;
        expiredTokenBufferMinutes?: number | undefined;
    }>, {
        backend: "memory" | "redis" | "postgres";
        url?: string | undefined;
        ttl?: number | undefined;
        encryption?: {
            key: string;
            algorithm: "aes-256-gcm";
        } | undefined;
        preRefreshMarginMinutes?: number | undefined;
        expiredTokenBufferMinutes?: number | undefined;
    }, {
        backend: "memory" | "redis" | "postgres";
        url?: string | undefined;
        ttl?: number | undefined;
        encryption?: {
            key: string;
            algorithm: "aes-256-gcm";
        } | undefined;
        preRefreshMarginMinutes?: number | undefined;
        expiredTokenBufferMinutes?: number | undefined;
    }>;
    http: z.ZodObject<{
        timeout: z.ZodOptional<z.ZodNumber>;
        retry: z.ZodEffects<z.ZodObject<{
            maxRetries: z.ZodNumber;
            baseDelay: z.ZodNumber;
            maxDelay: z.ZodNumber;
            retryableStatusCodes: z.ZodArray<z.ZodNumber, "many">;
        }, "strip", z.ZodTypeAny, {
            maxRetries: number;
            baseDelay: number;
            maxDelay: number;
            retryableStatusCodes: number[];
        }, {
            maxRetries: number;
            baseDelay: number;
            maxDelay: number;
            retryableStatusCodes: number[];
        }>, {
            maxRetries: number;
            baseDelay: number;
            maxDelay: number;
            retryableStatusCodes: number[];
        }, {
            maxRetries: number;
            baseDelay: number;
            maxDelay: number;
            retryableStatusCodes: number[];
        }>;
        keepAlive: z.ZodOptional<z.ZodBoolean>;
        proxy: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<false>, z.ZodObject<{
            host: z.ZodString;
            port: z.ZodNumber;
            protocol: z.ZodOptional<z.ZodEnum<["http", "https"]>>;
            auth: z.ZodOptional<z.ZodObject<{
                username: z.ZodString;
                password: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                username: string;
                password: string;
            }, {
                username: string;
                password: string;
            }>>;
        }, "strip", z.ZodTypeAny, {
            port: number;
            host: string;
            auth?: {
                username: string;
                password: string;
            } | undefined;
            protocol?: "http" | "https" | undefined;
        }, {
            port: number;
            host: string;
            auth?: {
                username: string;
                password: string;
            } | undefined;
            protocol?: "http" | "https" | undefined;
        }>]>>;
    }, "strip", z.ZodTypeAny, {
        retry: {
            maxRetries: number;
            baseDelay: number;
            maxDelay: number;
            retryableStatusCodes: number[];
        };
        timeout?: number | undefined;
        proxy?: false | {
            port: number;
            host: string;
            auth?: {
                username: string;
                password: string;
            } | undefined;
            protocol?: "http" | "https" | undefined;
        } | undefined;
        keepAlive?: boolean | undefined;
    }, {
        retry: {
            maxRetries: number;
            baseDelay: number;
            maxDelay: number;
            retryableStatusCodes: number[];
        };
        timeout?: number | undefined;
        proxy?: false | {
            port: number;
            host: string;
            auth?: {
                username: string;
                password: string;
            } | undefined;
            protocol?: "http" | "https" | undefined;
        } | undefined;
        keepAlive?: boolean | undefined;
    }>;
    rateLimits: z.ZodRecord<z.ZodEnum<["google", "github", "reddit", "twitter", "x", "rss"]>, z.ZodObject<{
        qps: z.ZodNumber;
        concurrency: z.ZodNumber;
        burst: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        concurrency: number;
        qps: number;
        burst?: number | undefined;
    }, {
        concurrency: number;
        qps: number;
        burst?: number | undefined;
    }>>;
    providers: z.ZodEffects<z.ZodRecord<z.ZodEnum<["google", "github", "reddit", "twitter", "x", "rss"]>, z.ZodObject<{
        clientId: z.ZodString;
        clientSecret: z.ZodString;
        authorizationEndpoint: z.ZodOptional<z.ZodString>;
        tokenEndpoint: z.ZodOptional<z.ZodString>;
        scopes: z.ZodArray<z.ZodString, "many">;
        redirectUri: z.ZodString;
        usePKCE: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        clientSecret: string;
        clientId: string;
        redirectUri: string;
        scopes: string[];
        usePKCE: boolean;
        authorizationEndpoint?: string | undefined;
        tokenEndpoint?: string | undefined;
    }, {
        clientSecret: string;
        clientId: string;
        redirectUri: string;
        scopes: string[];
        usePKCE: boolean;
        authorizationEndpoint?: string | undefined;
        tokenEndpoint?: string | undefined;
    }>>, Partial<Record<"google" | "github" | "reddit" | "twitter" | "x" | "rss", {
        clientSecret: string;
        clientId: string;
        redirectUri: string;
        scopes: string[];
        usePKCE: boolean;
        authorizationEndpoint?: string | undefined;
        tokenEndpoint?: string | undefined;
    }>>, Partial<Record<"google" | "github" | "reddit" | "twitter" | "x" | "rss", {
        clientSecret: string;
        clientId: string;
        redirectUri: string;
        scopes: string[];
        usePKCE: boolean;
        authorizationEndpoint?: string | undefined;
        tokenEndpoint?: string | undefined;
    }>>>;
    metrics: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodOptional<z.ZodBoolean>;
        port: z.ZodOptional<z.ZodNumber>;
        path: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        enabled?: boolean | undefined;
        port?: number | undefined;
        path?: string | undefined;
    }, {
        enabled?: boolean | undefined;
        port?: number | undefined;
        path?: string | undefined;
    }>>;
    logging: z.ZodOptional<z.ZodObject<{
        level: z.ZodOptional<z.ZodEnum<["debug", "info", "warn", "error"]>>;
        format: z.ZodOptional<z.ZodEnum<["json", "pretty"]>>;
    }, "strip", z.ZodTypeAny, {
        format?: "json" | "pretty" | undefined;
        level?: "debug" | "info" | "warn" | "error" | undefined;
    }, {
        format?: "json" | "pretty" | undefined;
        level?: "debug" | "info" | "warn" | "error" | undefined;
    }>>;
    useOctokit: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    providers: Partial<Record<"google" | "github" | "reddit" | "twitter" | "x" | "rss", {
        clientSecret: string;
        clientId: string;
        redirectUri: string;
        scopes: string[];
        usePKCE: boolean;
        authorizationEndpoint?: string | undefined;
        tokenEndpoint?: string | undefined;
    }>>;
    http: {
        retry: {
            maxRetries: number;
            baseDelay: number;
            maxDelay: number;
            retryableStatusCodes: number[];
        };
        timeout?: number | undefined;
        proxy?: false | {
            port: number;
            host: string;
            auth?: {
                username: string;
                password: string;
            } | undefined;
            protocol?: "http" | "https" | undefined;
        } | undefined;
        keepAlive?: boolean | undefined;
    };
    tokenStore: {
        backend: "memory" | "redis" | "postgres";
        url?: string | undefined;
        ttl?: number | undefined;
        encryption?: {
            key: string;
            algorithm: "aes-256-gcm";
        } | undefined;
        preRefreshMarginMinutes?: number | undefined;
        expiredTokenBufferMinutes?: number | undefined;
    };
    rateLimits: Partial<Record<"google" | "github" | "reddit" | "twitter" | "x" | "rss", {
        concurrency: number;
        qps: number;
        burst?: number | undefined;
    }>>;
    metrics?: {
        enabled?: boolean | undefined;
        port?: number | undefined;
        path?: string | undefined;
    } | undefined;
    logging?: {
        format?: "json" | "pretty" | undefined;
        level?: "debug" | "info" | "warn" | "error" | undefined;
    } | undefined;
    useOctokit?: boolean | undefined;
}, {
    providers: Partial<Record<"google" | "github" | "reddit" | "twitter" | "x" | "rss", {
        clientSecret: string;
        clientId: string;
        redirectUri: string;
        scopes: string[];
        usePKCE: boolean;
        authorizationEndpoint?: string | undefined;
        tokenEndpoint?: string | undefined;
    }>>;
    http: {
        retry: {
            maxRetries: number;
            baseDelay: number;
            maxDelay: number;
            retryableStatusCodes: number[];
        };
        timeout?: number | undefined;
        proxy?: false | {
            port: number;
            host: string;
            auth?: {
                username: string;
                password: string;
            } | undefined;
            protocol?: "http" | "https" | undefined;
        } | undefined;
        keepAlive?: boolean | undefined;
    };
    tokenStore: {
        backend: "memory" | "redis" | "postgres";
        url?: string | undefined;
        ttl?: number | undefined;
        encryption?: {
            key: string;
            algorithm: "aes-256-gcm";
        } | undefined;
        preRefreshMarginMinutes?: number | undefined;
        expiredTokenBufferMinutes?: number | undefined;
    };
    rateLimits: Partial<Record<"google" | "github" | "reddit" | "twitter" | "x" | "rss", {
        concurrency: number;
        qps: number;
        burst?: number | undefined;
    }>>;
    metrics?: {
        enabled?: boolean | undefined;
        port?: number | undefined;
        path?: string | undefined;
    } | undefined;
    logging?: {
        format?: "json" | "pretty" | undefined;
        level?: "debug" | "info" | "warn" | "error" | undefined;
    } | undefined;
    useOctokit?: boolean | undefined;
}>;
/**
 * Validate SDK initialization configuration
 *
 * @param config - Configuration object to validate
 * @returns Validated configuration (same object, but type-guaranteed)
 * @throws {z.ZodError} If configuration is invalid with detailed error messages
 */
export declare function validateConfig(config: unknown): {
    providers: Partial<Record<"google" | "github" | "reddit" | "twitter" | "x" | "rss", {
        clientSecret: string;
        clientId: string;
        redirectUri: string;
        scopes: string[];
        usePKCE: boolean;
        authorizationEndpoint?: string | undefined;
        tokenEndpoint?: string | undefined;
    }>>;
    http: {
        retry: {
            maxRetries: number;
            baseDelay: number;
            maxDelay: number;
            retryableStatusCodes: number[];
        };
        timeout?: number | undefined;
        proxy?: false | {
            port: number;
            host: string;
            auth?: {
                username: string;
                password: string;
            } | undefined;
            protocol?: "http" | "https" | undefined;
        } | undefined;
        keepAlive?: boolean | undefined;
    };
    tokenStore: {
        backend: "memory" | "redis" | "postgres";
        url?: string | undefined;
        ttl?: number | undefined;
        encryption?: {
            key: string;
            algorithm: "aes-256-gcm";
        } | undefined;
        preRefreshMarginMinutes?: number | undefined;
        expiredTokenBufferMinutes?: number | undefined;
    };
    rateLimits: Partial<Record<"google" | "github" | "reddit" | "twitter" | "x" | "rss", {
        concurrency: number;
        qps: number;
        burst?: number | undefined;
    }>>;
    metrics?: {
        enabled?: boolean | undefined;
        port?: number | undefined;
        path?: string | undefined;
    } | undefined;
    logging?: {
        format?: "json" | "pretty" | undefined;
        level?: "debug" | "info" | "warn" | "error" | undefined;
    } | undefined;
    useOctokit?: boolean | undefined;
};
/**
 * Validate configuration and return user-friendly errors
 *
 * @param config - Configuration object to validate
 * @returns Object with { success: boolean, data?: Config, errors?: string[] }
 */
export declare function validateConfigSafe(config: unknown): {
    success: boolean;
    data: {
        providers: Partial<Record<"google" | "github" | "reddit" | "twitter" | "x" | "rss", {
            clientSecret: string;
            clientId: string;
            redirectUri: string;
            scopes: string[];
            usePKCE: boolean;
            authorizationEndpoint?: string | undefined;
            tokenEndpoint?: string | undefined;
        }>>;
        http: {
            retry: {
                maxRetries: number;
                baseDelay: number;
                maxDelay: number;
                retryableStatusCodes: number[];
            };
            timeout?: number | undefined;
            proxy?: false | {
                port: number;
                host: string;
                auth?: {
                    username: string;
                    password: string;
                } | undefined;
                protocol?: "http" | "https" | undefined;
            } | undefined;
            keepAlive?: boolean | undefined;
        };
        tokenStore: {
            backend: "memory" | "redis" | "postgres";
            url?: string | undefined;
            ttl?: number | undefined;
            encryption?: {
                key: string;
                algorithm: "aes-256-gcm";
            } | undefined;
            preRefreshMarginMinutes?: number | undefined;
            expiredTokenBufferMinutes?: number | undefined;
        };
        rateLimits: Partial<Record<"google" | "github" | "reddit" | "twitter" | "x" | "rss", {
            concurrency: number;
            qps: number;
            burst?: number | undefined;
        }>>;
        metrics?: {
            enabled?: boolean | undefined;
            port?: number | undefined;
            path?: string | undefined;
        } | undefined;
        logging?: {
            format?: "json" | "pretty" | undefined;
            level?: "debug" | "info" | "warn" | "error" | undefined;
        } | undefined;
        useOctokit?: boolean | undefined;
    };
    errors?: undefined;
} | {
    success: boolean;
    errors: string[];
    data?: undefined;
};
//# sourceMappingURL=ConfigValidator.d.ts.map