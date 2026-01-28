/**
 * Prompts Endpoint Schemas
 *
 * Schemas for the /api/v1/prompts and /api/v1/prompts/:promptName endpoints.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import { z } from 'zod';
import { createSuccessResponseSchema, NotFoundErrorSchema, BadRequestErrorSchema, InternalServerErrorSchema } from './common';

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
 * Prompt get response data
 * POST /api/v1/prompts/:promptName
 */
export const PromptGetDataSchema = z.object({
  description: z.string().optional().describe('Prompt description'),
  messages: z.array(PromptMessageSchema).describe('Prompt messages'),
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
