/**
 * Solution Custom Resource Generation
 *
 * Generates Solution CR manifests from session data for tracking deployments
 */

import * as yaml from 'js-yaml';
import type { SolutionData } from '../tools/recommend';

export interface SolutionCROptions {
  solutionId: string;
  namespace: string;
  solution: SolutionData;
  generatedManifestsYaml: string;  // Already-generated application manifests
}

/**
 * Generate a Solution Custom Resource from solution session data
 * Parses generated manifests to extract actual resource references
 *
 * @param options Configuration containing solution data and generated manifests
 * @returns Solution CR as YAML string
 */
export function generateSolutionCR(options: SolutionCROptions): string {
  const { solutionId, namespace, solution, generatedManifestsYaml } = options;

  // Parse generated manifests to extract actual resource references
  const resourceReferences = extractResourceReferences(generatedManifestsYaml, namespace);

  // Build rationale from solution description and reasons
  const rationale = [
    solution.description,
    ...solution.reasons
  ].filter(Boolean).join('\n\n');

  // Get patterns and policies from session
  const patterns = solution.appliedPatterns || [];
  const policies = solution.questions?.relevantPolicies || [];

  // Create Solution CR object
  const solutionCR = {
    apiVersion: 'dot-ai.devopstoolkit.live/v1alpha1',
    kind: 'Solution',
    metadata: {
      name: `solution-${solutionId}`,
      namespace: namespace,
      labels: {
        'dot-ai.devopstoolkit.live/created-by': 'dot-ai-mcp',
        'dot-ai.devopstoolkit.live/solution-id': solutionId
      }
    },
    spec: {
      intent: solution.intent,
      resources: resourceReferences,
      context: {
        createdBy: 'dot-ai-mcp',
        rationale: rationale,
        patterns: patterns,
        policies: policies
      }
    }
  };

  // Convert to YAML
  return yaml.dump(solutionCR);
}

/**
 * Extract resource references from generated manifest YAML
 *
 * @param manifestsYaml Generated Kubernetes manifests as YAML string
 * @param defaultNamespace Default namespace if not specified in manifest
 * @returns Array of resource references
 */
function extractResourceReferences(manifestsYaml: string, defaultNamespace: string): Array<{
  apiVersion: string;
  kind: string;
  name: string;
  namespace: string;
}> {
  try {
    const manifests = yaml.loadAll(manifestsYaml);

    return manifests
      .filter((manifest: any) => manifest && manifest.kind && manifest.metadata?.name)
      .map((manifest: any) => ({
        apiVersion: manifest.apiVersion,
        kind: manifest.kind,
        name: manifest.metadata.name,
        namespace: manifest.metadata.namespace || defaultNamespace
      }));
  } catch (error) {
    console.error('Failed to extract resource references from manifests:', error);
    return [];
  }
}
