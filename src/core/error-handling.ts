/**
 * Comprehensive Error Handling System for App-Agent
 * 
 * Provides centralized error handling, logging, and context management
 * with support for MCP protocol, CLI operations, and core functionality.
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Error categories for systematic error classification
 */
export enum ErrorCategory {
  // Infrastructure errors
  KUBERNETES = 'kubernetes',
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  
  // Application errors
  VALIDATION = 'validation',
  CONFIGURATION = 'configuration',
  OPERATION = 'operation',
  
  // External service errors
  AI_SERVICE = 'ai_service',
  STORAGE = 'storage',
  
  // Protocol errors
  MCP_PROTOCOL = 'mcp_protocol',
  CLI_INTERFACE = 'cli_interface',
  
  // System errors
  INTERNAL = 'internal',
  UNKNOWN = 'unknown'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',           // Non-critical, operation can continue
  MEDIUM = 'medium',     // Important but recoverable
  HIGH = 'high',         // Significant impact, requires attention
  CRITICAL = 'critical'  // System-threatening, immediate action required
}

/**
 * Error context interface for comprehensive error tracking
 */
export interface ErrorContext {
  // Operation details
  operation: string;
  component: string;
  
  // User context
  userId?: string;
  sessionId?: string;
  requestId?: string;
  
  // Technical context
  timestamp: Date;
  version: string;
  
  // Input context
  input?: any;
  parameters?: Record<string, any>;
  
  // Stack trace and debugging
  originalError?: Error;
  stackTrace?: string;
  
  // Recovery information
  suggestedActions?: string[];
  isRetryable?: boolean;
  retryCount?: number;
}

/**
 * Structured error interface
 */
export interface AppError {
  // Core identification
  id: string;
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  
  // User-facing information
  message: string;
  userMessage?: string;
  technicalDetails?: string;
  
  // Context and debugging
  context: ErrorContext;
  
  // Timing
  timestamp: Date;
  
  // Recovery guidance
  suggestedActions: string[];
  isRetryable: boolean;
  
  // Chaining
  cause?: AppError;
}

/**
 * Log levels for structured logging
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * Structured log entry interface
 */
export interface LogEntry {
  level: LogLevel;
  timestamp: Date;
  message: string;
  component: string;
  operation?: string;
  requestId?: string;
  sessionId?: string;
  data?: any;
  error?: AppError;
  duration?: number;
}

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  debug(message: string, data?: any): void;
  info(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, error?: Error | AppError, data?: any): void;
  fatal(message: string, error?: Error | AppError, data?: any): void;
}

/**
 * Default console logger implementation
 */
export class ConsoleLogger implements Logger {
  private component: string;
  private minLevel: LogLevel;

  constructor(component: string, minLevel: LogLevel = LogLevel.INFO) {
    this.component = component;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const baseMessage = `[${timestamp}] ${level.toUpperCase()} [${this.component}] ${message}`;
    
    if (data) {
      return `${baseMessage} ${JSON.stringify(data, null, 2)}`;
    }
    
    return baseMessage;
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage(LogLevel.DEBUG, message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage(LogLevel.INFO, message, data));
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message, data));
    }
  }

  error(message: string, error?: Error | AppError, data?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorData = error ? { error: this.serializeError(error), ...data } : data;
      console.error(this.formatMessage(LogLevel.ERROR, message, errorData));
    }
  }

  fatal(message: string, error?: Error | AppError, data?: any): void {
    if (this.shouldLog(LogLevel.FATAL)) {
      const errorData = error ? { error: this.serializeError(error), ...data } : data;
      console.error(this.formatMessage(LogLevel.FATAL, message, errorData));
    }
  }

  private serializeError(error: Error | AppError): any {
    if ('category' in error) {
      // AppError
      return {
        id: error.id,
        code: error.code,
        category: error.category,
        severity: error.severity,
        message: error.message,
        context: error.context
      };
    } else {
      // Native Error
      return {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }
  }
}

/**
 * Error handler factory and utilities
 */
export class ErrorHandler {
  private static requestIdCounter = 0;
  private static logger: Logger = new ConsoleLogger('ErrorHandler');

  /**
   * Set custom logger implementation
   */
  static setLogger(logger: Logger): void {
    this.logger = logger;
  }

  /**
   * Generate unique request ID
   */
  static generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestIdCounter}`;
  }

  /**
   * Create comprehensive AppError from various error sources
   */
  static createError(
    category: ErrorCategory,
    severity: ErrorSeverity,
    message: string,
    context: Partial<ErrorContext>,
    originalError?: Error
  ): AppError {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date();

    const fullContext: ErrorContext = {
      operation: context.operation || 'unknown',
      component: context.component || 'unknown',
      timestamp,
      version: process.env.npm_package_version || '0.1.0',
      originalError,
      stackTrace: originalError?.stack || new Error().stack,
      isRetryable: context.isRetryable || false,
      retryCount: context.retryCount || 0,
      ...context
    };

    const suggestedActions = context.suggestedActions || this.getDefaultSuggestedActions(category);

    const appError: AppError = {
      id: errorId,
      code: this.generateErrorCode(category, severity),
      category,
      severity,
      message,
      userMessage: this.getUserFriendlyMessage(category, message),
      technicalDetails: originalError?.message,
      context: fullContext,
      timestamp,
      suggestedActions,
      isRetryable: fullContext.isRetryable || false,
      // Don't wrap the original error to prevent circular references
      cause: undefined
    };

    // Log the error
    this.logger.error(`Error created: ${message}`, appError, {
      category,
      severity,
      operation: fullContext.operation,
      component: fullContext.component
    });

    return appError;
  }

  /**
   * Convert AppError to McpError for MCP protocol
   */
  static toMcpError(appError: AppError): McpError {
    const errorCode = this.mapToMcpErrorCode(appError.category, appError.severity);
    const message = `${appError.message}${appError.technicalDetails ? ` - ${appError.technicalDetails}` : ''}`;
    
    return new McpError(errorCode, message);
  }

  /**
   * Handle error with automatic logging and context enhancement
   */
  static handleError(
    error: Error | AppError,
    context: Partial<ErrorContext>,
    options: {
      rethrow?: boolean;
      convertToMcp?: boolean;
      logLevel?: LogLevel;
    } = {}
  ): AppError | McpError {
    let appError: AppError;

    if ('category' in error) {
      // Already an AppError
      appError = error;
    } else {
      // Convert native Error to AppError
      appError = this.createError(
        this.categorizeError(error),
        this.assessSeverity(error),
        error.message,
        context,
        error
      );
    }

    // Log the handled error
    const logLevel = options.logLevel || LogLevel.ERROR;
    this.logger[logLevel](`Error handled in ${context.component || 'unknown'}`, appError);

    if (options.convertToMcp) {
      const mcpError = this.toMcpError(appError);
      if (options.rethrow) {
        throw mcpError;
      }
      return mcpError;
    }

    if (options.rethrow) {
      throw appError;
    }

    return appError;
  }

  /**
   * Wrap operation with error handling
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: Partial<ErrorContext>,
    options: {
      retryCount?: number;
      convertToMcp?: boolean;
    } = {}
  ): Promise<T> {
    const maxRetries = options.retryCount || 0;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`Executing operation: ${context.operation}`, {
          attempt: attempt + 1,
          maxRetries: maxRetries + 1
        });

        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        const enhancedContext = {
          ...context,
          retryCount: attempt,
          isRetryable: attempt < maxRetries
        };

        const appError = this.handleError(lastError, enhancedContext, {
          logLevel: attempt < maxRetries ? LogLevel.WARN : LogLevel.ERROR
        }) as AppError;

        // Retry if we haven't exceeded max retries and the error is retryable
        // For retry logic, we consider errors retryable by default unless explicitly marked as not retryable
        const shouldRetry = attempt < maxRetries && (appError.isRetryable || enhancedContext.isRetryable);
        
        if (shouldRetry) {
          this.logger.info(`Retrying operation: ${context.operation}`, {
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
            reason: appError.message
          });
          continue;
        }

        // Final attempt failed or not retryable
        if (options.convertToMcp) {
          throw this.toMcpError(appError);
        }
        throw appError;
      }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError!;
  }

  private static generateErrorCode(category: ErrorCategory, severity: ErrorSeverity): string {
    const categoryCode = category.toUpperCase().replace('_', '');
    const severityCode = severity.charAt(0).toUpperCase();
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5);
    return `${categoryCode}_${severityCode}_${timestamp}_${random}`;
  }

  private static mapToMcpErrorCode(category: ErrorCategory, severity: ErrorSeverity): ErrorCode {
    switch (category) {
      case ErrorCategory.VALIDATION:
        return ErrorCode.InvalidParams;
      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.AUTHORIZATION:
        return ErrorCode.InvalidParams;
      case ErrorCategory.MCP_PROTOCOL:
        return ErrorCode.MethodNotFound;
      case ErrorCategory.OPERATION:
      case ErrorCategory.CLI_INTERFACE:
        return ErrorCode.InvalidRequest;
      default:
        return ErrorCode.InternalError;
    }
  }

  private static categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    
    if (message.includes('kubeconfig') || message.includes('kubernetes')) {
      return ErrorCategory.KUBERNETES;
    }
    if (message.includes('network') || message.includes('connection')) {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('authentication') || message.includes('unauthorized')) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (message.includes('anthropic') || message.includes('ai') || message.includes('claude') || message.includes('api key invalid')) {
      return ErrorCategory.AI_SERVICE;
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorCategory.VALIDATION;
    }
    
    return ErrorCategory.UNKNOWN;
  }

  private static assessSeverity(error: Error): ErrorSeverity {
    const message = error.message.toLowerCase();
    
    if (message.includes('critical') || message.includes('fatal')) {
      return ErrorSeverity.CRITICAL;
    }
    if (message.includes('authentication') || message.includes('authorization')) {
      return ErrorSeverity.HIGH;
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorSeverity.MEDIUM;
    }
    
    return ErrorSeverity.LOW;
  }

  private static getUserFriendlyMessage(category: ErrorCategory, message: string): string {
    switch (category) {
      case ErrorCategory.KUBERNETES:
        return 'Unable to connect to Kubernetes cluster. Please check your kubeconfig and cluster connectivity.';
      case ErrorCategory.AUTHENTICATION:
        return 'Authentication failed. Please verify your credentials.';
      case ErrorCategory.VALIDATION:
        return 'Input validation failed. Please check your parameters and try again.';
      case ErrorCategory.AI_SERVICE:
        return 'AI service is temporarily unavailable. Please try again later.';
      default:
        return 'An unexpected error occurred. Please try again or contact support.';
    }
  }

  private static getDefaultSuggestedActions(category: ErrorCategory): string[] {
    switch (category) {
      case ErrorCategory.KUBERNETES:
        return [
          'Verify kubeconfig file exists and is valid',
          'Check cluster connectivity with kubectl cluster-info',
          'Ensure proper authentication credentials'
        ];
      case ErrorCategory.VALIDATION:
        return [
          'Review input parameters for correct format',
          'Check required fields are provided',
          'Verify data types match expected schema'
        ];
      case ErrorCategory.AI_SERVICE:
        return [
          'Check ANTHROPIC_API_KEY environment variable',
          'Verify API key is valid and has sufficient credits',
          'Try again after a short delay'
        ];
      default:
        return [
          'Try the operation again',
          'Check system logs for more details',
          'Contact support if problem persists'
        ];
    }
  }

  private static wrapNativeError(error: Error): AppError {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date();
    const category = this.categorizeError(error);
    const severity = this.assessSeverity(error);

    const context: ErrorContext = {
      operation: 'error_wrapping',
      component: 'ErrorHandler',
      timestamp,
      version: process.env.npm_package_version || '0.1.0',
      originalError: error,
      stackTrace: error.stack,
      isRetryable: false,
      retryCount: 0
    };

    const appError: AppError = {
      id: errorId,
      code: this.generateErrorCode(category, severity),
      category,
      severity,
      message: error.message,
      userMessage: this.getUserFriendlyMessage(category, error.message),
      technicalDetails: error.message,
      context,
      timestamp,
      suggestedActions: this.getDefaultSuggestedActions(category),
      isRetryable: false,
      // No cause to prevent circular reference
      cause: undefined
    };

    return appError;
  }
}