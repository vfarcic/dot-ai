/**
 * Embedding Migration REST API Response Schemas
 *
 * PRD #384: Optional Local Embedding Service
 * Schemas for the embedding migration endpoint (not exposed via MCP)
 */

import { z } from 'zod';
import { createSuccessResponseSchema, ErrorResponseSchema } from './common';

/**
 * Embedding migration request body
 */
export const EmbeddingMigrationRequestSchema = z.object({
  collection: z
    .string()
    .optional()
    .describe(
      'Collection name to migrate. If omitted, migrates all collections.'
    ),
});

export type EmbeddingMigrationRequest = z.infer<
  typeof EmbeddingMigrationRequestSchema
>;

/**
 * Per-collection migration result
 */
export const CollectionMigrationResultSchema = z.object({
  collection: z.string().describe('Collection name'),
  status: z
    .enum(['migrated', 'skipped', 'failed'])
    .describe('Migration outcome'),
  previousDimensions: z.number().describe('Vector dimensions before migration'),
  newDimensions: z.number().describe('Vector dimensions after migration'),
  total: z.number().describe('Total points in the collection'),
  processed: z.number().describe('Points successfully re-embedded'),
  failed: z.number().describe('Points that failed to re-embed'),
  error: z.string().optional().describe('Error message if migration failed'),
});

export type CollectionMigrationResult = z.infer<
  typeof CollectionMigrationResultSchema
>;

/**
 * Embedding migration response data
 */
export const EmbeddingMigrationDataSchema = z.object({
  collections: z
    .array(CollectionMigrationResultSchema)
    .describe('Per-collection results'),
  summary: z.object({
    totalCollections: z.number().describe('Total collections processed'),
    migrated: z.number().describe('Collections successfully migrated'),
    skipped: z
      .number()
      .describe('Collections skipped (dimensions already match)'),
    failed: z.number().describe('Collections that failed to migrate'),
  }),
});

export type EmbeddingMigrationData = z.infer<
  typeof EmbeddingMigrationDataSchema
>;

/**
 * Embedding migration success response
 */
export const EmbeddingMigrationResponseSchema = createSuccessResponseSchema(
  EmbeddingMigrationDataSchema
);

export type EmbeddingMigrationResponse = z.infer<
  typeof EmbeddingMigrationResponseSchema
>;

/**
 * Embedding migration error responses
 */
export const EmbeddingMigrationBadRequestErrorSchema =
  ErrorResponseSchema.extend({
    error: z.object({
      code: z.literal('BAD_REQUEST'),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  });

export const EmbeddingMigrationServiceUnavailableErrorSchema =
  ErrorResponseSchema.extend({
    error: z.object({
      code: z.enum(['EMBEDDING_SERVICE_UNAVAILABLE', 'PLUGIN_UNAVAILABLE']),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  });

export const EmbeddingMigrationErrorSchema = ErrorResponseSchema.extend({
  error: z.object({
    code: z.literal('MIGRATION_ERROR'),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
