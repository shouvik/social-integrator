#!/usr/bin/env tsx

/**
 * Generate JSON Schema from Zod normalization schema
 *
 * This script converts the Zod validation schema used in the Normalizer
 * to a standard JSON Schema format that can be consumed by other tools
 * and languages.
 *
 * Usage:
 *   tsx scripts/generate-schema.ts
 *   npm run generate:schema
 */

import fs from 'fs';
import path from 'path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { NormalizedItemSchema } from '../src/core/normalizer/Normalizer';

const OUTPUT_PATH = path.join(__dirname, '../src/core/normalizer/schema.json');

/**
 * Generate JSON Schema from Zod schema
 */
function generateSchema() {
  console.log('🔨 Generating JSON Schema from Zod...');

  const jsonSchema = zodToJsonSchema(NormalizedItemSchema, {
    name: 'NormalizedItem',
    $refStrategy: 'none',
    target: 'jsonSchema7',
    definitions: {},
    errorMessages: true,
  });

  // Add metadata to the schema
  const schemaWithMetadata = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://github.com/oauth-connector-sdk/normalized-item',
    title: 'NormalizedItem',
    description:
      'Normalized data format for all OAuth providers (Google, GitHub, Reddit, Twitter, RSS)',
    version: '1.0.0',
    ...jsonSchema,
    examples: [
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        source: 'github',
        externalId: '123456789',
        userId: 'user-123',
        title: 'Example Repository',
        bodyText: 'A repository demonstrating OAuth integration',
        url: 'https://github.com/user/repo',
        author: 'username',
        publishedAt: '2024-01-15T10:30:00Z',
        metadata: {
          stars: 42,
          language: 'TypeScript',
        },
      },
    ],
  };

  // Write to file
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(schemaWithMetadata, null, 2), 'utf-8');

  console.log(`✅ JSON Schema generated: ${OUTPUT_PATH}`);
  console.log(`📊 Schema version: ${schemaWithMetadata.version}`);
  console.log(
    `📄 Fields: id, source, externalId, userId, title, bodyText, url, author, publishedAt, metadata`
  );
}

// Run generation
try {
  generateSchema();
  process.exit(0);
} catch (error: any) {
  console.error('❌ Failed to generate JSON Schema:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}
