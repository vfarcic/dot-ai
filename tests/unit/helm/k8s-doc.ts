/**
 * Narrowing helper for rendered Helm output.
 *
 * `parseYamlDocs` returns `unknown[]`, so the chart tests used to reach into
 * documents with `(doc as any).metadata?.name`. This predicate does the same
 * check as a real type guard, so callers get a typed document and no `any`.
 */

export interface NamedK8sDoc {
  kind: string;
  metadata: { name: string; namespace?: string };
}

export function isNamedK8sDoc(doc: unknown): doc is NamedK8sDoc {
  if (typeof doc !== 'object' || doc === null) return false;
  const candidate = doc as {
    kind?: unknown;
    metadata?: { name?: unknown };
  };
  return (
    typeof candidate.kind === 'string' &&
    typeof candidate.metadata?.name === 'string'
  );
}
