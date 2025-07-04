# Error Handling Patterns and Best Practices

This document outlines the comprehensive error handling system implemented in the DevOps AI Toolkit MCP server.

## Overview

The error handling system provides:
- **Centralized Error Management**: Consistent error creation, categorization, and processing
- **Structured Logging**: Comprehensive logging with configurable levels and component-based filtering
- **Context Preservation**: Rich error context including operation details, stack traces, and retry information
- **MCP Protocol Integration**: Seamless conversion between internal errors and MCP protocol errors
- **Retry Logic**: Intelligent retry mechanisms with configurable parameters

## Core Components

### 1. Error Categories (`ErrorCategory`)

Errors are systematically classified into categories for better debugging and handling:

```typescript
enum ErrorCategory {
  // Infrastructure errors
  KUBERNETES = "kubernetes",
  NETWORK = "network", 
  AUTHENTICATION = "authentication",
  AUTHORIZATION = "authorization",
  
  // Application errors
  VALIDATION = "validation",
  CONFIGURATION = "configuration", 
  OPERATION = "operation",
  
  // External service errors
  AI_SERVICE = "ai_service",
  STORAGE = "storage",
  
  // Protocol errors
  MCP_PROTOCOL = "mcp_protocol",
  CLI_INTERFACE = "cli_interface",
  
  // System errors
  INTERNAL = "internal",
  UNKNOWN = "unknown"
}
```

### 2. Error Severity Levels (`ErrorSeverity`)

Errors are assigned severity levels to indicate impact and urgency:

```typescript
enum ErrorSeverity {
  LOW = "low",           // Minor issues, logging/monitoring
  MEDIUM = "medium",     // Functional impact, user-facing errors
  HIGH = "high",         // Service degradation, auth failures
  CRITICAL = "critical"  // System-threatening, immediate action required
}
```

### 3. AppError Interface

All application errors implement the `AppError` interface:

```typescript
interface AppError {
  id: string;                    // Unique error identifier
  code: string;                  // Generated error code
  category: ErrorCategory;       // Error classification
  severity: ErrorSeverity;       // Impact level
  message: string;               // Technical error message
  userMessage: string;           // User-friendly message
  technicalDetails?: string;     // Additional technical info
  context: ErrorContext;         // Rich contextual information
  timestamp: Date;               // When the error occurred
  suggestedActions: string[];    // Recommended remediation steps
  isRetryable: boolean;          // Whether operation can be retried
  cause?: Error;                 // Original causing error
}
```

### 4. Error Context (`ErrorContext`)

Rich context is captured for each error:

```typescript
interface ErrorContext {
  operation: string;             // What operation was being performed
  component: string;             // Which component generated the error
  requestId?: string;            // Request tracking ID
  userId?: string;               // Associated user
  sessionId?: string;            // Session identifier
  timestamp: Date;               // Context timestamp
  version: string;               // Application version
  originalError?: Error;         // Source error object
  stackTrace?: string;           // Full stack trace
  isRetryable: boolean;          // Retry eligibility
  retryCount: number;            // Current retry attempt
  input?: any;                   // Input that caused the error
  suggestedActions?: string[];   // Context-specific actions
}
```

## Error Handler Class

The `ErrorHandler` class provides centralized error management:

### Core Methods

#### `createError(category, severity, message, context, originalError?): AppError`
Creates a comprehensive AppError with automatic context enhancement and logging.

#### `toMcpError(appError): McpError`
Converts AppError to MCP protocol-compliant error format.

#### `handleError(error, context, options?): AppError | McpError`
Processes any error type with automatic categorization and optional MCP conversion.

#### `withErrorHandling<T>(operation, context, options?): Promise<T>`
Wraps operations with error handling and retry logic.

### Usage Examples

```typescript
// Create a validation error
const error = ErrorHandler.createError(
  ErrorCategory.VALIDATION,
  ErrorSeverity.MEDIUM,
  "Invalid input parameters",
  {
    operation: "input_validation",
    component: "MCPServer.handleRecommend",
    requestId: "req_123",
    input: userInput
  }
);

// Wrap operation with error handling
const result = await ErrorHandler.withErrorHandling(
  async () => {
    return await riskyOperation();
  },
  {
    operation: "recommend_tools",
    component: "MCPServer",
    requestId: requestId
  },
  {
    convertToMcp: true,
    retryCount: 2
  }
);
```

## Structured Logging

### ConsoleLogger Class

The `ConsoleLogger` provides structured logging with:
- **Log Levels**: DEBUG, INFO, WARN, ERROR, FATAL
- **Component-based Filtering**: Filter logs by component
- **Structured Output**: JSON-formatted log data
- **Error Serialization**: Proper serialization of AppError and native Error objects

```typescript
const logger = new ConsoleLogger('MCPServer', LogLevel.INFO);

logger.info('Processing request', { requestId, operation });
logger.error('Operation failed', error, { context: 'additional data' });
```

### Log Format

```
[2025-06-30T15:20:44.553Z] ERROR [MCPServer] Operation failed {
  "error": {
    "id": "err_1751296844532_3e1vhzmsm",
    "code": "VALIDATION_M_844553_tr5",
    "category": "validation",
    "severity": "medium",
    "message": "Invalid input parameters"
  },
  "requestId": "req_123",
  "operation": "recommend_tools"
}
```

## MCP Integration

### Error Code Mapping

AppError categories are mapped to MCP ErrorCodes:

```typescript
const mcpErrorMapping = {
  VALIDATION: ErrorCode.InvalidParams,
  AUTHENTICATION: ErrorCode.InvalidParams, 
  AUTHORIZATION: ErrorCode.InvalidParams,
  MCP_PROTOCOL: ErrorCode.MethodNotFound,
  OPERATION: ErrorCode.InvalidRequest,
  CLI_INTERFACE: ErrorCode.InvalidRequest,
  // Default: ErrorCode.InternalError
};
```

### MCP Tool Integration

MCP tools use error handling patterns:

```typescript
private async handleRecommend(args: any, requestId: string) {
  return await ErrorHandler.withErrorHandling(async () => {
    // Validate input
    SchemaValidator.validateToolInput('recommend', args, schema);
    
    // Process request
    const result = await this.processRecommendation(args);
    
    // Validate output
    SchemaValidator.validateToolOutput('recommend', result, outputSchema);
    
    return result;
  }, {
    operation: 'recommend_tool',
    component: 'MCPServer',
    requestId
  }, {
    convertToMcp: true,
    retryCount: 1
  });
}
```

## Retry Logic

### Automatic Retry Configuration

```typescript
const options = {
  retryCount: 3,           // Maximum retry attempts
  convertToMcp: true,      // Convert final error to MCP format
  logLevel: LogLevel.WARN  // Log level for retry attempts
};
```

### Retry Decision Logic

- Errors are retryable by default unless explicitly marked as non-retryable
- Authentication and validation errors are typically non-retryable
- Network and AI service errors are usually retryable
- Context-specific retry flags override defaults

## Best Practices

### 1. Error Creation

```typescript
// Good: Comprehensive error with context
const error = ErrorHandler.createError(
  ErrorCategory.AI_SERVICE,
  ErrorSeverity.HIGH,
  "API key validation failed",
  {
    operation: "api_key_check",
    component: "MCPServer.handleEnhanceSolution",
    requestId,
    suggestedActions: [
      "Set ANTHROPIC_API_KEY environment variable",
      "Verify the API key is valid and active",
      "Check that the API key has sufficient credits"
    ]
  }
);

// Bad: Generic error without context
throw new Error("API key failed");
```

### 2. Operation Wrapping

```typescript
// Good: Wrapped with error handling
return await ErrorHandler.withErrorHandling(
  async () => await operation(),
  { operation: 'specific_task', component: 'ComponentName', requestId },
  { convertToMcp: true, retryCount: 2 }
);

// Bad: Raw operation without handling
return await operation();
```

### 3. Error Propagation

```typescript
// Good: Handle and re-throw with context
try {
  await riskyOperation();
} catch (error) {
  const appError = ErrorHandler.handleError(error, context);
  throw appError;
}

// Bad: Silent failure or generic re-throw
try {
  await riskyOperation();
} catch (error) {
  console.log('Something went wrong');
  throw error;
}
```

### 4. Logging Levels

- **DEBUG**: Detailed trace information for debugging
- **INFO**: General operational information
- **WARN**: Warning conditions, retry attempts
- **ERROR**: Error conditions requiring attention
- **FATAL**: Critical errors causing system failure

### 5. User-Friendly Messages

Always provide clear, actionable user messages:

```typescript
getUserFriendlyMessage(ErrorCategory.KUBERNETES) {
  return 'Unable to connect to Kubernetes cluster. Please check your kubeconfig and cluster connectivity.';
}
```

## Error Code Generation

Error codes follow the pattern: `{CATEGORY}_{SEVERITY}_{TIMESTAMP}_{RANDOM}`

Example: `VALIDATION_M_844553_tr5`
- VALIDATION: Error category
- M: Medium severity (L/M/H/C)
- 844553: Last 6 digits of timestamp
- tr5: 3-character random suffix

## Testing Error Handling

### Unit Tests

```typescript
test('should create comprehensive AppError', () => {
  const error = ErrorHandler.createError(
    ErrorCategory.VALIDATION,
    ErrorSeverity.MEDIUM,
    'Test error',
    { operation: 'test', component: 'Test' }
  );
  
  expect(error.category).toBe(ErrorCategory.VALIDATION);
  expect(error.severity).toBe(ErrorSeverity.MEDIUM);
  expect(error.id).toBeDefined();
  expect(error.code).toMatch(/VALIDATION_M_\d+_\w+/);
});
```

### Integration Tests

```typescript
test('should handle MCP tool errors correctly', async () => {
  const result = await mcpServer.handleRecommend({}, 'test-request');
  
  expect(result.error).toBeInstanceOf(McpError);
  expect(result.error.code).toBe(ErrorCode.InvalidParams);
});
```

## Monitoring and Observability

### Error Metrics

Track key error metrics:
- Error rate by category and severity
- Retry success/failure rates
- Component-specific error patterns
- User-impacting error frequency

### Alerting

Set up alerts for:
- CRITICAL severity errors (immediate)
- HIGH severity error rate increases
- Retry failure patterns
- Authentication/authorization failures

## Migration Guide

### Converting Existing Error Handling

1. **Replace Generic Errors**:
   ```typescript
   // Before
   throw new Error('Something went wrong');
   
   // After
   throw ErrorHandler.createError(
     ErrorCategory.OPERATION,
     ErrorSeverity.MEDIUM,
     'Specific operation failed',
     context
   );
   ```

2. **Add Error Wrapping**:
   ```typescript
   // Before
   const result = await operation();
   
   // After
   const result = await ErrorHandler.withErrorHandling(
     () => operation(),
     context,
     options
   );
   ```

3. **Enhance Logging**:
   ```typescript
   // Before
   console.error('Error:', error);
   
   // After
   logger.error('Operation failed', error, additionalContext);
   ```

This comprehensive error handling system ensures robust, maintainable, and observable error management throughout the DevOps AI Toolkit MCP server.