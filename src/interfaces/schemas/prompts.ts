/**
 * Prompts Endpoint Schemas
 *
 * Schemas for the /api/v1/prompts and /api/v1/prompts/:promptName endpoints.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import { z } from 'zod';
import { createSuccessResponseSchema, NotFoundErrorSchema, BadRequestErrorSchema, InternalServerErrorSchema, BadGatewayErrorSchema, PayloadTooLargeErrorSchema } from './common';

/**
 * Prompt argument definition
 */
export const PromptArgumentSchema = z.object({
  name: z.string().describe('Argument name'),
  description: z.string().optional().describe('Argument description'),
  required: z.boolean().optional().describe('Whether the argument is required'),
});

export type PromptArgument = z.infer<typeof PromptArgumentSchema>;

/**
 * Prompt information in list
 */
export const PromptInfoSchema = z.object({
  name: z.string().describe('Prompt name/identifier'),
  description: z.string().optional().describe('Prompt description'),
  arguments: z.array(PromptArgumentSchema).optional().describe('Prompt arguments'),
});

export type PromptInfo = z.infer<typeof PromptInfoSchema>;

/**
 * Prompts list response data
 * GET /api/v1/prompts
 */
export const PromptsListDataSchema = z.object({
  prompts: z.array(PromptInfoSchema).describe('List of available prompts'),
});

export type PromptsListData = z.infer<typeof PromptsListDataSchema>;

export const PromptsListResponseSchema = createSuccessResponseSchema(PromptsListDataSchema);

export type PromptsListResponse = z.infer<typeof PromptsListResponseSchema>;

/**
 * Prompt message content
 */
export const PromptMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']).describe('Message role'),
  content: z.object({
    type: z.literal('text'),
    text: z.string().describe('Message text content'),
  }).describe('Message content'),
});

export type PromptMessage = z.infer<typeof PromptMessageSchema>;

/**
 * Supporting file for folder-based skills (base64-encoded)
 */
export const PromptFileSchema = z.object({
  path: z.string().describe('Relative path within skill folder'),
  content: z.string().describe('Base64-encoded file content'),
});

export type PromptFileData = z.infer<typeof PromptFileSchema>;

/**
 * Prompt get response data
 * POST /api/v1/prompts/:promptName
 */
export const PromptGetDataSchema = z.object({
  description: z.string().optional().describe('Prompt description'),
  messages: z.array(PromptMessageSchema).describe('Prompt messages'),
  files: z.array(PromptFileSchema).optional().describe('Supporting files for folder-based skills (base64-encoded)'),
});

export type PromptGetData = z.infer<typeof PromptGetDataSchema>;

export const PromptGetResponseSchema = createSuccessResponseSchema(PromptGetDataSchema);

export type PromptGetResponse = z.infer<typeof PromptGetResponseSchema>;

/**
 * Prompt get request body
 */
export const PromptGetRequestSchema = z.object({
  arguments: z.record(z.string(), z.any()).optional().describe('Arguments to pass to the prompt'),
});

export type PromptGetRequest = z.infer<typeof PromptGetRequestSchema>;

/**
 * Prompts endpoint error schemas
 */
export const PromptNotFoundErrorSchema = NotFoundErrorSchema.extend({
  error: z.object({
    code: z.literal('NOT_FOUND'),
    message: z.string().regex(/Prompt not found/),
    details: z.any().optional(),
  }),
});

export const PromptValidationErrorSchema = BadRequestErrorSchema.extend({
  error: z.object({
    code: z.literal('VALIDATION_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const PromptsListErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('PROMPTS_LIST_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const PromptGetErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('PROMPT_GET_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

/**
 * 502 returned when a per-request prompts-repo override (?repo= / body.repo)
 * could not be cloned — e.g. a missing/wrong forwarded X-Dot-AI-Git-Token or an
 * unreachable host (issue #575). The message is credential-scrubbed.
 */
export const PromptsSourceErrorSchema = BadGatewayErrorSchema.extend({
  error: z.object({
    code: z.literal('PROMPTS_SOURCE_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

/**
 * Prompts cache refresh response data
 * POST /api/v1/prompts/refresh
 */
export const PromptsCacheRefreshDataSchema = z.object({
  refreshed: z.boolean().describe('Whether the cache was refreshed'),
  promptsLoaded: z.number().describe('Total number of prompts loaded after refresh'),
  source: z.string().describe('Source of prompts (e.g., "built-in", "built-in+repository")'),
});

export type PromptsCacheRefreshData = z.infer<typeof PromptsCacheRefreshDataSchema>;

export const PromptsCacheRefreshResponseSchema = createSuccessResponseSchema(PromptsCacheRefreshDataSchema);

export type PromptsCacheRefreshResponse = z.infer<typeof PromptsCacheRefreshResponseSchema>;

export const PromptsCacheRefreshErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('PROMPTS_CACHE_REFRESH_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

/**
 * Source ingestion (PRD #647 M2)
 * POST /api/v1/prompts/sources
 *
 * A single file in the uploaded manifest: a relative path, base64-encoded
 * content, and an optional POSIX mode string.
 */
export const PromptsSourceIngestFileSchema = z.object({
  path: z.string().describe('Relative path within the uploaded skill source'),
  content: z.string().describe('Base64-encoded file content'),
  mode: z.string().optional().describe('POSIX file mode (e.g., "0644")'),
});

export type PromptsSourceIngestFile = z.infer<
  typeof PromptsSourceIngestFileSchema
>;

/**
 * Source ingestion request body — the CLI-uploaded skill source manifest.
 */
export const PromptsSourceIngestRequestSchema = z.object({
  source: z
    .string()
    .describe(
      'Stable source identifier (e.g., "local:team-dev" or a git URL the server cannot reach)'
    ),
  contentHash: z
    .string()
    .optional()
    .describe('CLI-computed content hash (enables future re-upload dedup)'),
  files: z
    .array(PromptsSourceIngestFileSchema)
    .describe('Uploaded files with base64-encoded content'),
});

export type PromptsSourceIngestRequest = z.infer<
  typeof PromptsSourceIngestRequestSchema
>;

/**
 * Source ingestion response data — the cached source echoed back (scrubbed).
 */
export const PromptsSourceIngestDataSchema = z.object({
  source: z
    .string()
    .describe('Credential-scrubbed identifier the cached source is keyed by'),
  contentHash: z.string().optional().describe('Echoed content hash, if provided'),
  fileCount: z.number().describe('Number of files cached'),
  // PRD #647 N16: the runtime only ever returns 'ingested' (decoded+written) or
  // 'unchanged' (D3 dedup short-circuit), so pin the contract to that union.
  status: z
    .enum(['ingested', 'unchanged'])
    .describe(
      'Ingestion status: "ingested" (decoded and cached) or "unchanged" (content-hash dedup short-circuit)'
    ),
});

export type PromptsSourceIngestData = z.infer<
  typeof PromptsSourceIngestDataSchema
>;

export const PromptsSourceIngestResponseSchema = createSuccessResponseSchema(
  PromptsSourceIngestDataSchema
);

export type PromptsSourceIngestResponse = z.infer<
  typeof PromptsSourceIngestResponseSchema
>;

export const PromptsSourceIngestErrorSchema = BadRequestErrorSchema.extend({
  error: z.object({
    code: z.literal('VALIDATION_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

/**
 * PRD #647 A7 (CodeRabbit) — 413 returned when the ingest raw body exceeds the
 * 512 KiB cap (enforced in mcp.ts parseRequestBody before route dispatch). The
 * handler emits code PAYLOAD_TOO_LARGE.
 */
export const PromptsSourceIngestPayloadTooLargeErrorSchema =
  PayloadTooLargeErrorSchema;

/**
 * PRD #647 A8 (CodeRabbit) — endpoint-specific 500 for the ingest route. The
 * handler only ever emits PROMPTS_SOURCE_INGEST_ERROR for non-validation
 * failures (rest-api.ts handlePromptsSourceIngest), so the contract is narrowed
 * from the shared InternalServerErrorSchema union to exactly that code to avoid
 * misleading client SDK unions.
 */
export const PromptsSourceIngestServerErrorSchema =
  InternalServerErrorSchema.extend({
    error: z.object({
      code: z.literal('PROMPTS_SOURCE_INGEST_ERROR'),
      message: z.string(),
      details: z.any().optional(),
    }),
  });

/**
 * PRD #647 A6 (CodeRabbit) — query parameters the render endpoint
 * (POST /api/v1/prompts/:promptName) accepts. These were previously undeclared
 * by convention; declaring them makes the new `?source=` ingest-render contract
 * (and its `?repo=`/`?path=`/`?branch=` siblings) discoverable in the OpenAPI
 * spec. All are optional and additive — absent means the env-var/built-in path.
 */
export const PromptGetQuerySchema = z.object({
  source: z
    .string()
    .optional()
    .describe(
      'Render a previously-ingested (CLI-uploaded) source by its identifier with no git clone (PRD #647). Takes precedence over repo/path/branch.'
    ),
  repo: z
    .string()
    .optional()
    .describe('Per-request git repository URL override (PRD #581)'),
  path: z
    .string()
    .optional()
    .describe('Subdirectory within the override repo (PRD #621)'),
  branch: z
    .string()
    .optional()
    .describe('Branch of the override repo (PRD #621)'),
});

export type PromptGetQuery = z.infer<typeof PromptGetQuerySchema>;
