/**
 * Unit Tests: OpenAPI Generator
 *
 * Covers the OpenApiGenerator's Zod-to-JSON-Schema conversion cache.
 *
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 * PRD #647: `?source=` query on the prompts list vs. render endpoints
 */

import { describe, test, expect } from 'vitest';
import { z } from 'zod';
import { OpenApiGenerator } from '../../../src/interfaces/openapi-generator';
import { RestToolRegistry } from '../../../src/interfaces/rest-registry';
import { RestRouteRegistry } from '../../../src/interfaces/rest-route-registry';
import { Logger } from '../../../src/core/error-handling';

// Silent logger for testing
const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Minimal OpenAPI parameter shape we assert against
type OpenApiParameter = {
  name: string;
  in: string;
  description: string;
};

describe('OpenApiGenerator', () => {
  describe('schemaCache identity keying', () => {
    /**
     * Regression guard for the schemaCache WeakMap (openapi-generator.ts).
     *
     * The cache is keyed on the Zod schema OBJECT identity, NOT on a structural
     * `JSON.stringify` of the schema. Two query schemas that are structurally
     * identical but differ only in their `.describe()` text — exactly the PRD
     * #647 `?source=` query on the prompts LIST (GET /api/v1/prompts) vs. the
     * RENDER (POST /api/v1/prompts/:promptName) endpoints — would serialize to
     * the same structural key, so a string key would conflate them and leak one
     * endpoint's description into the other's. Identity (WeakMap) keying gives
     * each distinct schema object its own cache entry, so both descriptions
     * survive into the generated OpenAPI parameters.
     */
    test('keeps distinct descriptions for structurally-identical query schemas', () => {
      const LIST_SOURCE_DESCRIPTION =
        'Enumerate a previously-ingested (CLI-uploaded) source by its identifier with no git clone (PRD #647).';
      const RENDER_SOURCE_DESCRIPTION =
        'Render a previously-ingested (CLI-uploaded) source by its identifier with no git clone (PRD #647).';

      // Structurally identical: both are `{ source?: string }`. The ONLY
      // difference is the `.describe()` text on the `source` field, mirroring
      // PromptsListQuerySchema vs. PromptGetQuerySchema.
      const ListQuerySchema = z.object({
        source: z.string().optional().describe(LIST_SOURCE_DESCRIPTION),
      });
      const RenderQuerySchema = z.object({
        source: z.string().optional().describe(RENDER_SOURCE_DESCRIPTION),
      });

      // Sanity check: the two schemas really are distinct objects but
      // structurally equal once converted to JSON Schema sans description.
      expect(ListQuerySchema).not.toBe(RenderQuerySchema);

      const ResponseSchema = z.object({ ok: z.boolean() });

      const routeRegistry = new RestRouteRegistry(mockLogger);
      routeRegistry.register({
        path: '/api/v1/prompts',
        method: 'GET',
        description: 'List prompts (optionally by source)',
        tags: ['Prompts'],
        query: ListQuerySchema,
        response: ResponseSchema,
      });
      routeRegistry.register({
        path: '/api/v1/prompts/:promptName',
        method: 'POST',
        description: 'Render a prompt (optionally from a source)',
        tags: ['Prompts'],
        query: RenderQuerySchema,
        response: ResponseSchema,
      });

      const toolRegistry = new RestToolRegistry(mockLogger);
      const generator = new OpenApiGenerator(
        toolRegistry,
        mockLogger,
        {},
        routeRegistry
      );

      const spec = generator.generateSpec();

      const listParams = (spec.paths['/api/v1/prompts'].get
        .parameters ?? []) as OpenApiParameter[];
      const renderParams = (spec.paths['/api/v1/prompts/{promptName}'].post
        .parameters ?? []) as OpenApiParameter[];

      const listSource = listParams.find(
        (p) => p.name === 'source' && p.in === 'query'
      );
      const renderSource = renderParams.find(
        (p) => p.name === 'source' && p.in === 'query'
      );

      expect(listSource).toBeDefined();
      expect(renderSource).toBeDefined();

      // Both descriptions must survive — a structural cache key would have
      // conflated the two and made these equal.
      expect(listSource!.description).toBe(LIST_SOURCE_DESCRIPTION);
      expect(renderSource!.description).toBe(RENDER_SOURCE_DESCRIPTION);
      expect(listSource!.description).not.toBe(renderSource!.description);
    });
  });
});
