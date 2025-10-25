"use strict";
// src/core/normalizer/Normalizer.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.Normalizer = exports.NormalizedItemSchema = void 0;
const zod_1 = require("zod");
const ProviderMappers_1 = require("./ProviderMappers");
// Validation schema (exported for JSON Schema generation)
exports.NormalizedItemSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    source: zod_1.z.string(),
    externalId: zod_1.z.string(),
    userId: zod_1.z.string(),
    title: zod_1.z.string().optional(),
    bodyText: zod_1.z.string().optional(),
    url: zod_1.z.string().url().optional(),
    author: zod_1.z.string().optional(),
    publishedAt: zod_1.z.string().datetime().optional(), // ISO 8601 validation
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
class Normalizer {
    mappers;
    constructor() {
        this.mappers = new ProviderMappers_1.ProviderMappers();
    }
    /**
     * Normalize provider-specific data
     * Accepts both official providers and internal service keys (e.g. 'google-calendar')
     */
    normalize(provider, userId, rawData) {
        const mapper = this.mappers.get(provider);
        if (!mapper) {
            throw new Error(`No mapper found for provider: ${provider}`);
        }
        return rawData.map((item) => {
            const normalized = mapper(item, userId);
            // Validate schema
            try {
                exports.NormalizedItemSchema.parse(normalized);
            }
            catch (error) {
                throw new Error(`Schema validation failed for ${provider}: ${error}`);
            }
            return normalized;
        });
    }
}
exports.Normalizer = Normalizer;
//# sourceMappingURL=Normalizer.js.map