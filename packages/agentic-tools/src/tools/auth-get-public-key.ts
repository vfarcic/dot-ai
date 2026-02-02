/**
 * Auth Tool: Get Public Key
 *
 * PRD #360: User Authentication & Access Control
 *
 * Returns the RSA public key in JWK format for JWT validation.
 * MCP server calls this once at startup and caches the key for
 * local JWT validation (no per-request plugin calls needed).
 */

import {
  AuthTool,
  getPublicKeyJWK,
  authSuccessResult,
  authErrorResult,
  withAuthValidation,
} from './auth-base';

export const authGetPublicKey: AuthTool = {
  definition: {
    name: 'auth_get_public_key',
    type: 'agentic',
    description:
      'Returns the RSA public key in JWK (JSON Web Key) format for JWT validation. ' +
      'MCP server calls this once at startup and caches the key. ' +
      'The key is used to verify JWT signatures locally without calling the plugin for each request.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  handler: withAuthValidation(async () => {
    try {
      const publicKey = await getPublicKeyJWK();
      return authSuccessResult(publicKey, 'Public key retrieved successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return authErrorResult(message, 'Failed to retrieve public key');
    }
  }),
};
