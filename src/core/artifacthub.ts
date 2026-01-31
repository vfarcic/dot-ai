/**
 * ArtifactHub API Client
 *
 * Handles searching and retrieving Helm chart information from ArtifactHub
 * API Documentation: https://artifacthub.io/docs/api/
 */

/**
 * Raw search result from ArtifactHub API
 */
export interface ArtifactHubSearchResult {
  package_id: string;
  name: string;
  normalized_name: string;
  logo_image_id?: string;
  stars: number;
  official: boolean;
  verified_publisher: boolean;
  repository: {
    name: string;
    url: string;
    official: boolean;
    verified_publisher: boolean;
  };
  version: string;
  app_version?: string;
  description: string;
}

/**
 * Raw package details from ArtifactHub API
 */
export interface ArtifactHubPackageDetails {
  package_id: string;
  name: string;
  normalized_name: string;
  version: string;
  app_version?: string;
  description: string;
  readme?: string;
  values_schema?: Record<string, unknown>;
  default_values?: string;
  repository: {
    name: string;
    url: string;
  };
  maintainers?: Array<{ name: string; email?: string }>;
  links?: Array<{ name: string; url: string }>;
}

/**
 * ArtifactHub API client for Helm chart discovery
 */
export class ArtifactHubService {
  private baseUrl = 'https://artifacthub.io/api/v1';
  private timeout = 10000; // 10 seconds

  // Repositories to exclude from search results
  // Bitnami charts often have non-standard configurations
  private excludedRepos = ['bitnami'];

  /**
   * Search for Helm charts matching the query
   *
   * @param query - Search query (e.g., "argo cd", "prometheus")
   * @param limit - Maximum number of results to return
   * @returns Array of search results sorted by relevance (excludes Bitnami)
   */
  async searchCharts(query: string, limit: number = 10): Promise<ArtifactHubSearchResult[]> {
    const encodedQuery = encodeURIComponent(query);
    // kind=0 filters for Helm charts only
    const url = `${this.baseUrl}/packages/search?ts_query_web=${encodedQuery}&kind=0&limit=${limit}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ArtifactHub API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { packages?: ArtifactHubSearchResult[] };

      // Filter out excluded repositories (e.g., Bitnami)
      const packages = data.packages || [];
      return packages.filter(pkg =>
        !this.excludedRepos.includes(pkg.repository.name.toLowerCase())
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`ArtifactHub API timeout after ${this.timeout}ms`);
      }
      throw new Error(`ArtifactHub search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get detailed information about a specific chart
   *
   * @param repoName - Repository name (e.g., "argo")
   * @param chartName - Chart name (e.g., "argo-cd")
   * @returns Detailed chart information including README and values schema
   */
  async getChartDetails(repoName: string, chartName: string): Promise<ArtifactHubPackageDetails> {
    const url = `${this.baseUrl}/packages/helm/${repoName}/${chartName}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ArtifactHub API error: ${response.status} ${response.statusText}`);
      }

      return await response.json() as ArtifactHubPackageDetails;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`ArtifactHub API timeout after ${this.timeout}ms`);
      }
      throw new Error(`ArtifactHub chart details failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Format chart results for AI analysis prompt
   *
   * @param charts - Array of ArtifactHub search results
   * @returns Formatted string for AI prompt
   */
  formatChartsForAI(charts: ArtifactHubSearchResult[]): string {
    return charts.map((chart, index) => `
Chart ${index + 1}: ${chart.name}
  Repository: ${chart.repository.name} (${chart.repository.url})
  Version: ${chart.version}${chart.app_version ? ` (App: ${chart.app_version})` : ''}
  Description: ${chart.description || 'No description'}
  Official: ${chart.official || chart.repository.official ? 'Yes' : 'No'}
  Verified Publisher: ${chart.verified_publisher || chart.repository.verified_publisher ? 'Yes' : 'No'}
  Stars: ${chart.stars}
`).join('\n');
  }
}
