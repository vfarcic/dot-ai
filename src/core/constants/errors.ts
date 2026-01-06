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
  NETWORK_UNAVAILABLE: 'Network unavailable'
} as const;

/**
 * Authentication and authorization error messages
 */
export const AUTH_ERRORS = {
  AUTHENTICATION_FAILED: 'Authentication failed. Please verify your credentials.',
  UNAUTHORIZED: 'Unauthorized access',
  INVALID_TOKEN: 'Invalid or expired token',
  MISSING_CREDENTIALS: 'Authentication credentials missing',
  INVALID_API_KEY: 'Invalid API key provided'
} as const;

/**
 * Kubernetes-specific error messages
 */
export const KUBERNETES_ERRORS = {
  CLUSTER_UNREACHABLE: 'Unable to connect to Kubernetes cluster. Please check your kubeconfig and cluster connectivity.',
  KUBECONFIG_NOT_FOUND: 'Kubeconfig file not found',
  INVALID_CONTEXT: 'Invalid Kubernetes context',
  RESOURCE_NOT_FOUND: 'Kubernetes resource not found',
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions to access Kubernetes resources'
} as const;

/**
 * AI service error messages
 */
export const AI_SERVICE_ERRORS = {
  SERVICE_UNAVAILABLE: 'AI service is temporarily unavailable. Please try again later.',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please wait before retrying.',
  INVALID_MODEL: 'Invalid AI model specified',
  API_KEY_INVALID: 'AI provider API key is invalid',
  QUOTA_EXCEEDED: 'AI service quota exceeded'
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
    context ? `An unexpected error occurred in ${context}` : 'An unexpected error occurred. Please try again or contact support.',
    
  /**
   * Feature not implemented template
   * @param feature - The feature that is not implemented
   */
  NOT_IMPLEMENTED: (feature: string) => `Feature not implemented: ${feature}`,
  
  /**
   * Dependency missing template
   * @param dependency - The missing dependency
   */
  DEPENDENCY_MISSING: (dependency: string) => `Required dependency missing: ${dependency}`
} as const;