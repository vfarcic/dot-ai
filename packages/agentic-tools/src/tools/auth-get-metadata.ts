/**
 * Auth Tool: Get OAuth Metadata
 *
 * PRD #360: User Authentication & Access Control
 *
 * Returns OAuth metadata for well-known endpoints:
 * - Protected Resource Metadata (RFC 9728)
 * - Authorization Server Metadata (RFC 8414)
 *
 * MCP server calls this when serving /.well-known/oauth-protected-resource
 * and /.well-known/oauth-authorization-server endpoints.
 */

import { requireParam } from './base';
import {
  AuthTool,
  generateProtectedResourceMetadata,
  generateAuthorizationServerMetadata,
  authSuccessResult,
  authErrorResult,
  withAuthValidation,
} from './auth-base';

export const authGetMetadata: AuthTool = {
  definition: {
    name: 'auth_get_metadata',
    type: 'agentic',
    description:
      'Returns OAuth metadata for well-known endpoints. ' +
      'Supports two metadata types: "protected-resource" (RFC 9728) for /.well-known/oauth-protected-resource, ' +
      'and "authorization-server" (RFC 8414) for /.well-known/oauth-authorization-server. ' +
      'The issuer URL should be the MCP server base URL.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['protected-resource', 'authorization-server'],
          description:
            'Which metadata to return: "protected-resource" for RFC 9728, "authorization-server" for RFC 8414',
        },
        issuer: {
          type: 'string',
          description: 'The issuer URL (MCP server base URL, e.g., "https://mcp.company.com")',
        },
      },
      required: ['type', 'issuer'],
    },
  },

  handler: withAuthValidation(async (args) => {
    const metadataType = requireParam<string>(args, 'type', 'auth_get_metadata');
    const issuer = requireParam<string>(args, 'issuer', 'auth_get_metadata');

    // Validate issuer is a valid URL
    try {
      new URL(issuer);
    } catch {
      return authErrorResult(
        'Invalid issuer URL',
        'The issuer parameter must be a valid URL'
      );
    }

    // Remove trailing slash from issuer for consistency
    const normalizedIssuer = issuer.replace(/\/$/, '');

    if (metadataType === 'protected-resource') {
      const metadata = generateProtectedResourceMetadata(normalizedIssuer);
      return authSuccessResult(metadata, 'Protected resource metadata generated');
    }

    if (metadataType === 'authorization-server') {
      const metadata = generateAuthorizationServerMetadata(normalizedIssuer);
      return authSuccessResult(metadata, 'Authorization server metadata generated');
    }

    return authErrorResult(
      `Invalid metadata type: ${metadataType}`,
      'Metadata type must be "protected-resource" or "authorization-server"'
    );
  }),
};
