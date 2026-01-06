/**
 * Error messages and templates
 *
 * Centralized error messages, categories, and templates for
 * comprehensive error handling across the application.
 */

/**
 * Network and connectivity error messages
 */
export const NETWORK_ERRORS = {
  CONNECTION_FAILED: 'Failed to establish connection',
  TIMEOUT: 'Request timeout',
  UNREACHABLE: 'Service unreachable',
  DNS_RESOLUTION_FAILED: 'DNS resolution failed',
  NETWORK_UNAVAILABLE: 'Network unavailable',
} as const;

/**
 * Authentication and authorization error messages
 */
export const AUTH_ERRORS = {
  AUTHENTICATION_FAILED:
    'Authentication failed. Please verify your credentials.',
  UNAUTHORIZED: 'Unauthorized access',
  INVALID_TOKEN: 'Invalid or expired token',
  MISSING_CREDENTIALS: 'Authentication credentials missing',
  INVALID_API_KEY: 'Invalid API key provided',
} as const;

/**
 * Kubernetes-specific error messages
 */
export const KUBERNETES_ERRORS = {
  CLUSTER_UNREACHABLE:
    'Unable to connect to Kubernetes cluster. Please check your kubeconfig and cluster connectivity.',
  KUBECONFIG_NOT_FOUND: 'Kubeconfig file not found',
  INVALID_CONTEXT: 'Invalid Kubernetes context',
  RESOURCE_NOT_FOUND: 'Kubernetes resource not found',
  INSUFFICIENT_PERMISSIONS:
    'Insufficient permissions to access Kubernetes resources',
} as const;

/**
 * Kubernetes error templates with detailed troubleshooting
 */
export const KUBERNETES_ERROR_TEMPLATES = {
  /**
   * Authentication error templates
   */
  AUTHENTICATION: {
    /**
     * Bearer token authentication failed
     * @param originalError - The original error message
     */
    INVALID_TOKEN: (originalError: string) =>
      `Token may be expired: Bearer token authentication failed.\n\nTroubleshooting steps:\n- Token may be expired - refresh credentials\n- Check token format in kubeconfig\n- Re-authenticate with cluster: kubectl auth login\n- Verify service account token if applicable\n\nOriginal error: ${originalError}`,

    /**
     * Certificate authentication failed
     * @param originalError - The original error message
     */
    CERTIFICATE_FAILED: (originalError: string) =>
      `Certificate authentication failed: Client certificate validation error.\n\nTroubleshooting steps:\n- Verify certificate path in kubeconfig\n- Check certificate expiration date\n- Ensure certificate authority (CA) bundle is correct\n- Re-generate client certificates if needed\n\nOriginal error: ${originalError}`,

    /**
     * Authentication provider not available
     * @param originalError - The original error message
     */
    PROVIDER_MISSING: (originalError: string) =>
      `Authentication provider not available: Required auth plugin missing.\n\nTroubleshooting steps:\n- Install required authentication plugin (e.g., OIDC)\n- Check kubectl config for auth provider configuration\n- Verify authentication method compatibility\n- Consult cluster administrator for auth setup\n\nOriginal error: ${originalError}`,

    /**
     * Generic authentication failure
     * @param originalError - The original error message
     */
    GENERIC_FAILED: (originalError: string) =>
      `Authentication failed: Invalid or missing credentials.\n\nTroubleshooting steps:\n- Verify credentials in kubeconfig\n- Re-authenticate with cluster\n- Check authentication method configuration\n- Contact cluster administrator if needed\n\nOriginal error: ${originalError}`,
  },

  /**
   * Authorization/RBAC error templates
   */
  AUTHORIZATION: {
    /**
     * CRD discovery permission error
     * @param originalError - The original error message
     */
    CRD_PERMISSIONS: (originalError: string) =>
      `CRD discovery requires cluster-level permissions: Insufficient RBAC permissions.\n\nTroubleshooting steps:\n- CRD discovery requires admin privileges\n- Request cluster-admin role or CRD read permissions\n- Contact cluster administrator for permission escalation\n- Use 'kubectl auth can-i list customresourcedefinitions' to check permissions\n\nOriginal error: ${originalError}`,

    /**
     * Forbidden access error
     * @param originalError - The original error message
     */
    FORBIDDEN: (originalError: string) =>
      `Insufficient permissions: RBAC restrictions prevent this operation.\n\nTroubleshooting steps:\n- RBAC role required for resource access\n- Request appropriate permissions from cluster administrator\n- Check current permissions: kubectl auth can-i list <resource>\n- Consider using cluster-admin role for discovery operations\n\nOriginal error: ${originalError}`,

    /**
     * Generic permission denied error
     * @param originalError - The original error message
     */
    PERMISSION_DENIED: (originalError: string) =>
      `Permission denied: Insufficient RBAC permissions for cluster access.\n\nTroubleshooting steps:\n- Request appropriate RBAC permissions\n- Check current access: kubectl auth can-i list <resource>\n- Contact cluster administrator for role assignment\n- Verify service account permissions if applicable\n\nOriginal error: ${originalError}`,
  },

  /**
   * API availability error templates
   */
  API: {
    /**
     * API version not supported
     * @param originalError - The original error message
     */
    VERSION_UNSUPPORTED: (originalError: string) =>
      `API version not supported: Cluster doesn't support requested API version.\n\nTroubleshooting steps:\n- Try different API version (e.g., apps/v1 instead of apps/v1beta1)\n- Check available API versions: kubectl api-versions\n- Verify Kubernetes cluster version compatibility\n- Consult API migration guides for version changes\n\nOriginal error: ${originalError}`,

    /**
     * API resource not available
     * @param originalError - The original error message
     */
    RESOURCE_UNAVAILABLE: (originalError: string) =>
      `API resource not available: Requested resource type not found in cluster.\n\nTroubleshooting steps:\n- Check available resources: kubectl api-resources\n- Verify cluster supports required resource types\n- Check Kubernetes version compatibility\n- Confirm cluster configuration and enabled APIs\n\nOriginal error: ${originalError}`,
  },

  /**
   * Kubeconfig error templates
   */
  KUBECONFIG: {
    /**
     * Context not found error
     * @param originalError - The original error message
     */
    CONTEXT_NOT_FOUND: (originalError: string) =>
      `Context not found: Specified context doesn't exist in kubeconfig.\n\nTroubleshooting steps:\n- List available contexts: kubectl config get-contexts\n- Set correct context: kubectl config use-context <context-name>\n- Verify kubeconfig file contains required context\n- Check context name spelling and case sensitivity\n\nOriginal error: ${originalError}`,

    /**
     * Kubeconfig file not found
     * @param originalError - The original error message
     */
    FILE_NOT_FOUND: (originalError: string) =>
      `Kubeconfig file not found: Cannot locate configuration file.\n\nTroubleshooting steps:\n- Check file path exists and is accessible\n- Verify kubeconfig file permissions\n- Set KUBECONFIG environment variable if needed\n- Create kubeconfig file or copy from cluster administrator\n\nOriginal error: ${originalError}`,

    /**
     * Invalid kubeconfig format
     * @param originalError - The original error message
     */
    INVALID_FORMAT: (originalError: string) =>
      `Invalid kubeconfig format: Configuration file has syntax or format errors.\n\nTroubleshooting steps:\n- Validate YAML syntax in kubeconfig file\n- Check file structure: kubectl config view\n- Restore from backup or re-download from cluster\n- Verify all required sections (clusters, contexts, users)\n\nOriginal error: ${originalError}`,
  },

  /**
   * Version compatibility error template
   * @param originalError - The original error message
   */
  VERSION_COMPATIBILITY: (originalError: string) =>
    `Kubernetes version compatibility issue: Version mismatch detected.\n\nTroubleshooting steps:\n- Check cluster and client versions: kubectl version\n- Verify supported Kubernetes versions for this tool\n- Update kubectl client if needed\n- Consult compatibility matrix for version support\n\nOriginal error: ${originalError}`,
} as const;

/**
 * AI service error messages
 */
export const AI_SERVICE_ERRORS = {
  SERVICE_UNAVAILABLE:
    'AI service is temporarily unavailable. Please try again later.',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please wait before retrying.',
  INVALID_MODEL: 'Invalid AI model specified',
  API_KEY_INVALID: 'AI provider API key is invalid',
  QUOTA_EXCEEDED: 'AI service quota exceeded',
} as const;

/**
 * AI service error templates with dynamic content
 */
export const AI_SERVICE_ERROR_TEMPLATES = {
  /**
   * API key required error template
   * @param providerType - The AI provider type requiring the API key
   */
  API_KEY_REQUIRED: (providerType: string) =>
    `API key is required for ${providerType} provider`,

  /**
   * OpenAI API key required for specific service
   * @param service - The service requiring OpenAI API key
   */
  OPENAI_KEY_REQUIRED: (service: string) =>
    `OpenAI API key required for ${service}`,

  /**
   * AI provider not available error
   */
  PROVIDER_NOT_AVAILABLE:
    'AI provider is not available. No API keys configured. Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or another supported provider key.',

  /**
   * Embedding service unavailable error
   */
  EMBEDDING_SERVICE_UNAVAILABLE: 'embedding service unavailable',

  /**
   * AI provider not initialized for specific functionality
   * @param functionality - The functionality requiring AI provider
   */
  PROVIDER_NOT_INITIALIZED: (functionality: string) =>
    `AI provider not initialized. API key required for ${functionality}.`,

  /**
   * Unsupported provider error
   * @param providerType - The unsupported provider type
   * @param supportedProviders - List of supported providers
   */
  UNSUPPORTED_PROVIDER: (providerType: string, supportedProviders: string[]) =>
    `Unsupported provider: ${providerType}. Must be one of: ${supportedProviders.join(', ')}`,

  /**
   * ResourceRanker not available error
   * @param functionality - The specific functionality needing ResourceRanker
   */
  RESOURCE_RANKER_UNAVAILABLE: (functionality: string) =>
    `ResourceRanker not available. AI provider API key is required for ${functionality}.`,
} as const;

/**
 * Generic error templates
 */
export const ERROR_TEMPLATES = {
  /**
   * Generic error with context
   * @param operation - The operation that failed
   * @param reason - The reason for failure
   */
  OPERATION_FAILED: (operation: string, reason?: string) =>
    reason ? `${operation} failed: ${reason}` : `${operation} failed`,

  /**
   * Unexpected error template
   * @param context - Context where the error occurred
   */
  UNEXPECTED_ERROR: (context?: string) =>
    context
      ? `An unexpected error occurred in ${context}`
      : 'An unexpected error occurred. Please try again or contact support.',

  /**
   * Feature not implemented template
   * @param feature - The feature that is not implemented
   */
  NOT_IMPLEMENTED: (feature: string) => `Feature not implemented: ${feature}`,

  /**
   * Dependency missing template
   * @param dependency - The missing dependency
   */
  DEPENDENCY_MISSING: (dependency: string) =>
    `Required dependency missing: ${dependency}`,
} as const;
