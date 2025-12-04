/**
 * Type definitions for Helm-based solutions and sessions
 */

/**
 * Helm chart information from ArtifactHub
 */
export interface HelmChartInfo {
  repository: string;      // e.g., "https://argoproj.github.io/argo-helm"
  repositoryName: string;  // e.g., "argo"
  chartName: string;       // e.g., "argo-cd"
  version?: string;        // e.g., "5.46.0"
  appVersion?: string;     // e.g., "2.8.0"
  official?: boolean;
  verifiedPublisher?: boolean;
}

/**
 * Solution data for Helm-based installations
 * Stored in sol-* sessions alongside capability-based solutions
 */
export interface HelmSolutionData {
  intent: string;
  type: 'helm';
  chart: HelmChartInfo;
  score: number;
  description: string;
  reasons: string[];
  questions?: {
    required?: any[];
    basic?: any[];
    advanced?: any[];
  };
  answers: Record<string, any>;
  generatedValues?: Record<string, any>;
  helmCommand?: string;
  namespace?: string;
  releaseName?: string;
  timestamp: string;
}
