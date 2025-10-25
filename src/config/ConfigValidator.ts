// src/config/ConfigValidator.ts

import { z } from 'zod';

// Token Store Configuration Schema
const TokenStoreConfigSchema = z
  .object({
    backend: z.enum(['memory', 'redis', 'postgres'], {
      errorMap: () => ({ message: "Token store backend must be 'memory', 'redis', or 'postgres'" }),
    }),
    url: z.string().url().optional(),
    encryption: z
      .object({
        key: z
          .string()
          .length(64, 'Encryption key must be exactly 64 characters')
          .regex(
            /^[0-9a-f]{64}$/i,
            'Encryption key must be a valid 32-byte hexadecimal string (0-9, a-f)'
          ),
        algorithm: z.literal('aes-256-gcm'),
      })
      .optional(),
    ttl: z.number().positive().optional(),
    preRefreshMarginMinutes: z.number().min(1).max(60).optional(),
    expiredTokenBufferMinutes: z.number().min(1).max(60).optional(),
  })
  .refine(
    (data) => {
      if (data.backend !== 'memory' && !data.url) {
        return false;
      }
      return true;
    },
    {
      message: "Redis and Postgres backends require 'url' configuration",
    }
  );

// Retry Configuration Schema
const RetryConfigSchema = z
  .object({
    maxRetries: z.number().int().min(0).max(10),
    baseDelay: z.number().positive(),
    maxDelay: z.number().positive(),
    retryableStatusCodes: z.array(z.number().int().min(100).max(599)),
  })
  .refine((data) => data.maxDelay >= data.baseDelay, {
    message: 'maxDelay must be greater than or equal to baseDelay',
  });

// Rate Limit Configuration Schema
const RateLimitConfigSchema = z.object({
  qps: z.number().positive(),
  concurrency: z.number().int().positive(),
  burst: z.number().int().positive().optional(),
});

// OAuth2 Configuration Schema
const OAuth2ConfigSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  authorizationEndpoint: z.string().url().optional(),
  tokenEndpoint: z.string().url().optional(),
  scopes: z.array(z.string().min(1)),
  redirectUri: z.string().url(),
  usePKCE: z.boolean(),
});

// OAuth1 support planned but not yet integrated (removed OAuth1ConfigSchema)

// Logger Configuration Schema
const LoggerConfigSchema = z
  .object({
    level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    format: z.enum(['json', 'pretty']).optional(),
  })
  .optional();

// Metrics Configuration Schema
const MetricsConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    port: z.number().int().min(1024).max(65535).optional(),
    path: z.string().startsWith('/').optional(),
  })
  .optional();

// Complete Init Configuration Schema
export const InitConfigSchema = z.object({
  tokenStore: TokenStoreConfigSchema,
  http: z.object({
    timeout: z.number().positive().optional(),
    retry: RetryConfigSchema,
    keepAlive: z.boolean().optional(),
  }),
  rateLimits: z.record(
    z.enum(['google', 'github', 'reddit', 'twitter', 'x', 'rss']),
    RateLimitConfigSchema
  ),
  providers: z
    .record(
      z.enum(['google', 'github', 'reddit', 'twitter', 'x', 'rss']),
      OAuth2ConfigSchema // OAuth1 support not yet integrated, removed from union
    )
    .refine((providers) => Object.keys(providers).length > 0, {
      message: 'At least one provider must be configured',
    }),
  metrics: MetricsConfigSchema,
  logging: LoggerConfigSchema,
  useOctokit: z.boolean().optional(),
});

/**
 * Validate SDK initialization configuration
 *
 * @param config - Configuration object to validate
 * @returns Validated configuration (same object, but type-guaranteed)
 * @throws {z.ZodError} If configuration is invalid with detailed error messages
 */
export function validateConfig(config: unknown) {
  return InitConfigSchema.parse(config);
}

/**
 * Validate configuration and return user-friendly errors
 *
 * @param config - Configuration object to validate
 * @returns Object with { success: boolean, data?: Config, errors?: string[] }
 */
export function validateConfigSafe(config: unknown) {
  const result = InitConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`),
  };
}
