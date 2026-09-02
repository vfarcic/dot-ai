/**
 * REST API response shapes, as the integration tests consume them.
 *
 * These interfaces are deliberately *partial*: each covers the fields the tests
 * actually probe, not the full server-side type. That keeps them honest — a test
 * asserting on `relativePath` should not have to satisfy every field of an
 * internal type it never looks at.
 *
 * Where src already exports the exact shape it is reused rather than
 * re-declared, so the tests move with the production type.
 */

import type { Question } from '../../../src/core/schema.js';

export type { Question };

/** One entry in the solution list returned by the `recommend` stage. */
export interface SolutionSummary {
  solutionId: string;
  /** 'single' | 'combination' for capability solutions, 'helm' for Helm charts. */
  type: string;
  score?: number;
  description?: string;
  chart?: {
    repositoryName?: string;
    chartName?: string;
    version?: string;
    repository?: string;
  };
}

/** A file emitted by generateManifests (raw, helm or kustomize output). */
export interface GeneratedFile {
  relativePath: string;
  content: string;
}

/** An owner reference on a Kubernetes object. */
export interface OwnerReference {
  kind: string;
  name: string;
  apiVersion?: string;
  uid?: string;
}

/**
 * A Kubernetes object as it appears in parsed manifest YAML or kubectl JSON.
 * Every field is optional because tests parse partial/heterogeneous documents
 * (a YAML stream can even yield null entries, hence the callers' `m?.kind`).
 */
export interface K8sManifest {
  kind?: string;
  apiVersion?: string;
  type?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: OwnerReference[];
  };
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

/** A repo file as reported by the projectSetup / audit tools. */
export interface RepoFile {
  path: string;
  content?: string;
  action?: string;
}

/** The `gitPush` block returned by the pushToGit stage (PRD #710 PR mode). */
export interface GitPushResult {
  filesPushed?: string[];
  branch?: string;
  commitSha?: string;
  pullRequest?: {
    number?: number;
    branch?: string;
    url?: string;
  };
}

/**
 * Minimal OpenAPI document shape — only the parts the openapi tests assert on.
 *
 * `toHaveProperty` / `toMatchObject` do the real structural checking; these
 * types exist so the traversal to the assertion is itself typed.
 */
export interface OpenApiParameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: Record<string, unknown>;
  description?: string;
}

export interface OpenApiOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: Record<string, unknown>;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, unknown>>;
}

/** One path item: HTTP method -> operation, plus possible shared keys. */
export type OpenApiPathItem = Record<string, OpenApiOperation | undefined>;

export interface OpenApiSpec {
  openapi?: string;
  tags?: Array<{ name: string; description?: string }>;
  info?: Record<string, unknown>;
  servers?: Array<Record<string, unknown>>;
  paths?: Record<string, OpenApiPathItem>;
  components?: {
    schemas?: Record<string, Record<string, unknown>>;
    securitySchemes?: Record<string, Record<string, unknown>>;
  };
}

/** A Pod as the remediation tests read it back from kubectl. */
export interface PodResource {
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
  };
  spec?: {
    containers?: Array<{
      name?: string;
      image?: string;
      resources?: {
        limits?: Record<string, string>;
        requests?: Record<string, string>;
      };
    }>;
  };
  status?: {
    phase?: string;
    conditions?: Array<{ type: string; status: string; reason?: string }>;
    containerStatuses?: Array<{
      name?: string;
      ready?: boolean;
      restartCount: number;
    }>;
  };
}

/** One action in a remediate response (PRD #407 gitSource attribution). */
export interface RemediationAction {
  action?: string;
  description?: string;
  command?: string;
  risk?: string;
  gitSource?: unknown;
}

/** One entry in the remediate execution `results` array. */
export interface CommandExecutionResult {
  success: boolean;
  command?: string;
  output?: string;
  error?: string;
}

/** One entry in an operate tool's proposedChanges buckets. */
export interface ProposedChange {
  kind?: string;
  name?: string;
  namespace?: string;
  rationale?: string;
}

/** A HorizontalPodAutoscaler as the operate tests read it back. */
export interface HpaResource {
  metadata?: { name?: string; namespace?: string };
  spec?: {
    minReplicas?: number;
    maxReplicas?: number;
    scaleTargetRef?: { kind?: string; name?: string };
  };
}
