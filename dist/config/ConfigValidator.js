"use strict";
// src/config/ConfigValidator.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.InitConfigSchema = void 0;
exports.validateConfig = validateConfig;
exports.validateConfigSafe = validateConfigSafe;
const zod_1 = require("zod");
// Token Store Configuration Schema
const TokenStoreConfigSchema = zod_1.z
    .object({
    backend: zod_1.z.enum(['memory', 'redis', 'postgres'], {
        errorMap: () => ({ message: "Token store backend must be 'memory', 'redis', or 'postgres'" }),
    }),
    url: zod_1.z.string().url().optional(),
    encryption: zod_1.z
        .object({
        key: zod_1.z
            .string()
            .length(64, 'Encryption key must be exactly 64 characters')
            .regex(/^[0-9a-f]{64}$/i, 'Encryption key must be a valid 32-byte hexadecimal string (0-9, a-f)'),
        algorithm: zod_1.z.literal('aes-256-gcm'),
    })
        .optional(),
    ttl: zod_1.z.number().positive().optional(),
    preRefreshMarginMinutes: zod_1.z.number().min(1).max(60).optional(),
    expiredTokenBufferMinutes: zod_1.z.number().min(1).max(60).optional(),
})
    .refine((data) => {
    if (data.backend !== 'memory' && !data.url) {
        return false;
    }
    return true;
}, {
    message: "Redis and Postgres backends require 'url' configuration",
});
// Retry Configuration Schema
const RetryConfigSchema = zod_1.z
    .object({
    maxRetries: zod_1.z.number().int().min(0).max(10),
    baseDelay: zod_1.z.number().positive(),
    maxDelay: zod_1.z.number().positive(),
    retryableStatusCodes: zod_1.z.array(zod_1.z.number().int().min(100).max(599)),
})
    .refine((data) => data.maxDelay >= data.baseDelay, {
    message: 'maxDelay must be greater than or equal to baseDelay',
});
const HttpProxyConfigSchema = zod_1.z.union([
    zod_1.z.literal(false),
    zod_1.z.object({
        host: zod_1.z.string().min(1),
        port: zod_1.z.number().int().min(1).max(65535),
        protocol: zod_1.z.enum(['http', 'https']).optional(),
        auth: zod_1.z
            .object({
            username: zod_1.z.string().min(1),
            password: zod_1.z.string().min(1),
        })
            .optional(),
    }),
]);
// Rate Limit Configuration Schema
const RateLimitConfigSchema = zod_1.z.object({
    qps: zod_1.z.number().positive(),
    concurrency: zod_1.z.number().int().positive(),
    burst: zod_1.z.number().int().positive().optional(),
});
// OAuth2 Configuration Schema
const OAuth2ConfigSchema = zod_1.z.object({
    clientId: zod_1.z.string().min(1),
    clientSecret: zod_1.z.string().min(1),
    authorizationEndpoint: zod_1.z.string().url().optional(),
    tokenEndpoint: zod_1.z.string().url().optional(),
    scopes: zod_1.z.array(zod_1.z.string().min(1)),
    redirectUri: zod_1.z.string().url(),
    usePKCE: zod_1.z.boolean(),
});
// OAuth1 support planned but not yet integrated (removed OAuth1ConfigSchema)
// Logger Configuration Schema
const LoggerConfigSchema = zod_1.z
    .object({
    level: zod_1.z.enum(['debug', 'info', 'warn', 'error']).optional(),
    format: zod_1.z.enum(['json', 'pretty']).optional(),
})
    .optional();
// Metrics Configuration Schema
const MetricsConfigSchema = zod_1.z
    .object({
    enabled: zod_1.z.boolean().optional(),
    port: zod_1.z.number().int().min(1024).max(65535).optional(),
    path: zod_1.z.string().startsWith('/').optional(),
})
    .optional();
// Complete Init Configuration Schema
exports.InitConfigSchema = zod_1.z.object({
    tokenStore: TokenStoreConfigSchema,
    http: zod_1.z.object({
        timeout: zod_1.z.number().positive().optional(),
        retry: RetryConfigSchema,
        keepAlive: zod_1.z.boolean().optional(),
        proxy: HttpProxyConfigSchema.optional(),
    }),
    rateLimits: zod_1.z.record(zod_1.z.enum(['google', 'github', 'reddit', 'twitter', 'x', 'rss']), RateLimitConfigSchema),
    providers: zod_1.z
        .record(zod_1.z.enum(['google', 'github', 'reddit', 'twitter', 'x', 'rss']), OAuth2ConfigSchema // OAuth1 support not yet integrated, removed from union
    )
        .refine((providers) => Object.keys(providers).length > 0, {
        message: 'At least one provider must be configured',
    }),
    metrics: MetricsConfigSchema,
    logging: LoggerConfigSchema,
    useOctokit: zod_1.z.boolean().optional(),
});
/**
 * Validate SDK initialization configuration
 *
 * @param config - Configuration object to validate
 * @returns Validated configuration (same object, but type-guaranteed)
 * @throws {z.ZodError} If configuration is invalid with detailed error messages
 */
function validateConfig(config) {
    return exports.InitConfigSchema.parse(config);
}
/**
 * Validate configuration and return user-friendly errors
 *
 * @param config - Configuration object to validate
 * @returns Object with { success: boolean, data?: Config, errors?: string[] }
 */
function validateConfigSafe(config) {
    const result = exports.InitConfigSchema.safeParse(config);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return {
        success: false,
        errors: result.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`),
    };
}
//# sourceMappingURL=ConfigValidator.js.map