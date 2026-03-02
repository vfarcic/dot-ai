/**
 * User Management Endpoint Schemas (PRD #380 Task 2.5)
 *
 * Schemas for the /api/v1/users endpoints.
 */

import { z } from 'zod';
import {
  createSuccessResponseSchema,
  ErrorResponseSchema,
  ErrorDetailsSchema,
  InternalServerErrorSchema,
} from './common';

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const UserCreateRequestSchema = z.object({
  email: z.string().email().describe('User email address'),
  password: z.string().min(8).describe('User password (minimum 8 characters)'),
});

export type UserCreateRequest = z.infer<typeof UserCreateRequestSchema>;

export const UserEmailParamsSchema = z.object({
  email: z.string().describe('User email address'),
});

// ---------------------------------------------------------------------------
// Response data schemas
// ---------------------------------------------------------------------------

export const UserEntrySchema = z.object({
  email: z.string().email().describe('User email address'),
});

export const UserCreateDataSchema = z.object({
  email: z.string().email().describe('Created user email'),
  message: z.string().describe('Result message'),
});

export type UserCreateData = z.infer<typeof UserCreateDataSchema>;

export const UserCreateResponseSchema =
  createSuccessResponseSchema(UserCreateDataSchema);

export type UserCreateResponse = z.infer<typeof UserCreateResponseSchema>;

export const UserListDataSchema = z.object({
  users: z.array(UserEntrySchema).describe('List of users'),
  total: z.number().describe('Total number of users'),
});

export type UserListData = z.infer<typeof UserListDataSchema>;

export const UserListResponseSchema =
  createSuccessResponseSchema(UserListDataSchema);

export type UserListResponse = z.infer<typeof UserListResponseSchema>;

export const UserDeleteDataSchema = z.object({
  email: z.string().email().describe('Deleted user email'),
  message: z.string().describe('Result message'),
});

export type UserDeleteData = z.infer<typeof UserDeleteDataSchema>;

export const UserDeleteResponseSchema =
  createSuccessResponseSchema(UserDeleteDataSchema);

export type UserDeleteResponse = z.infer<typeof UserDeleteResponseSchema>;

// ---------------------------------------------------------------------------
// Error schemas
// ---------------------------------------------------------------------------

export const UserConflictErrorSchema = ErrorResponseSchema.extend({
  error: ErrorDetailsSchema.extend({
    code: z.literal('USER_CONFLICT'),
  }),
});

export const UserNotFoundErrorSchema = ErrorResponseSchema.extend({
  error: ErrorDetailsSchema.extend({
    code: z.literal('USER_NOT_FOUND'),
  }),
});

export const UserBadRequestErrorSchema = ErrorResponseSchema.extend({
  error: ErrorDetailsSchema.extend({
    code: z.literal('INVALID_REQUEST'),
  }),
});

export const UserManagementErrorSchema = InternalServerErrorSchema.extend({
  error: ErrorDetailsSchema.extend({
    code: z.literal('USER_MANAGEMENT_ERROR'),
  }),
});
