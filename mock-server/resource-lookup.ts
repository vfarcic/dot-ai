/**
 * Mock-server helpers for the single-resource endpoint
 * (`GET /api/v1/resource`).
 *
 * The real server fetches a single Kubernetes object from the cluster given a
 * kind/apiVersion/name(/namespace) selector and returns it under
 * `data.resource`. The mock mirrors that wire contract by looking the object up
 * in a deterministic fixture collection (`resources/single-resources.json`),
 * which holds full manifests for every resource the list endpoints expose.
 *
 * Extracted from server.ts so the matching logic can be unit-tested without
 * starting the HTTP listener (mirrors prompts-override.ts).
 *
 * Requested by dot-ai-ui: the resource-detail view (Overview/Metadata/Spec/
 * Status/YAML tabs) depends on this endpoint; the mock previously returned 501.
 */

// Fixed timestamp keeps responses byte-stable across runs (matches the other
// resource fixtures). The mock is for deterministic tests, not wall-clock data.
const META = { timestamp: '2024-01-15T10:30:00.000Z', version: '1.0.0' };

export function isSingleResourceRoutePath(path: string): boolean {
  return path === '/api/v1/resource';
}

export interface ResourceQuery {
  kind?: string | null;
  apiVersion?: string | null;
  name?: string | null;
  namespace?: string | null;
}

export interface ResourceLookupResult {
  status: 200 | 400 | 404;
  body: unknown;
}

interface K8sResource {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
  };
}

function getResources(fixture: unknown): K8sResource[] {
  if (!fixture || typeof fixture !== 'object') return [];
  const resources = (fixture as { resources?: unknown }).resources;
  return Array.isArray(resources) ? (resources as K8sResource[]) : [];
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * Resolve a single resource from the fixture collection.
 *
 * Matching rules (mirroring how the real server selects an object):
 * - `kind` and `name` are required; missing either yields 400.
 * - `kind` and `name` must match exactly.
 * - `apiVersion`, when supplied, must match exactly.
 * - `namespace`, when supplied, must match exactly. When omitted, the resource
 *   is matched regardless of namespace (cluster-scoped lookup style).
 * - No match yields 404 with the requested selector echoed back.
 */
export function lookupResource(
  fixture: unknown,
  query: ResourceQuery
): ResourceLookupResult {
  const kind = normalize(query.kind);
  const name = normalize(query.name);
  const apiVersion = normalize(query.apiVersion);
  const namespace = normalize(query.namespace);

  const missing: string[] = [];
  if (!kind) missing.push('kind');
  if (!name) missing.push('name');
  if (missing.length > 0) {
    return {
      status: 400,
      body: {
        success: false,
        error: {
          code: 'MISSING_PARAMETER',
          message: `Missing required parameter${
            missing.length > 1 ? 's' : ''
          }: ${missing.join(', ')}`,
          details: {
            requiredParameters: ['kind', 'name'],
            missingParameters: missing,
          },
        },
        meta: META,
      },
    };
  }

  const match = getResources(fixture).find(resource => {
    if (normalize(resource.kind) !== kind) return false;
    if (normalize(resource.metadata?.name) !== name) return false;
    if (apiVersion && normalize(resource.apiVersion) !== apiVersion) {
      return false;
    }
    if (namespace && normalize(resource.metadata?.namespace) !== namespace) {
      return false;
    }
    return true;
  });

  if (!match) {
    return {
      status: 404,
      body: {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: namespace
            ? `Resource not found: ${kind}/${name} in namespace ${namespace}`
            : `Resource not found: ${kind}/${name}`,
          details: {
            kind,
            name,
            ...(apiVersion ? { apiVersion } : {}),
            ...(namespace ? { namespace } : {}),
          },
        },
        meta: META,
      },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      data: { resource: match },
      meta: META,
    },
  };
}
