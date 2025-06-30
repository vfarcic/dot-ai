import { 
  ErrorHandler, 
  ErrorCategory, 
  ErrorSeverity, 
  ConsoleLogger, 
  LogLevel,
  AppError,
  ErrorContext
} from '../../src/core/error-handling';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

describe('Error Handling System', () => {
  describe('ErrorHandler', () => {
    beforeEach(() => {
      // Reset logger to default for each test
      ErrorHandler.setLogger(new ConsoleLogger('Test', LogLevel.DEBUG));
    });

    describe('Error Creation', () => {
      test('should create comprehensive AppError', () => {
        const context: Partial<ErrorContext> = {
          operation: 'test_operation',
          component: 'TestComponent',
          userId: 'user123',
          sessionId: 'session456',
          input: { test: 'data' }
        };

        const error = ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          'Test error message',
          context
        );

        expect(error).toMatchObject({
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.MEDIUM,
          message: 'Test error message',
          isRetryable: false
        });

        expect(error.id).toMatch(/^err_\d+_[a-z0-9]+$/);
        expect(error.code).toMatch(/^VALIDATION_M_\d+_[a-z0-9]+$/);
        expect(error.timestamp).toBeInstanceOf(Date);
        expect(error.context.operation).toBe('test_operation');
        expect(error.context.component).toBe('TestComponent');
        expect(error.context.userId).toBe('user123');
        expect(error.suggestedActions).toBeInstanceOf(Array);
        expect(error.suggestedActions.length).toBeGreaterThan(0);
      });

      test('should wrap original error with context', () => {
        const originalError = new Error('Original error message');
        const context: Partial<ErrorContext> = {
          operation: 'test_wrap',
          component: 'TestWrapper'
        };

        const appError = ErrorHandler.createError(
          ErrorCategory.INTERNAL,
          ErrorSeverity.HIGH,
          'Wrapped error',
          context,
          originalError
        );

        expect(appError.context.originalError).toBe(originalError);
        expect(appError.context.stackTrace).toBe(originalError.stack);
        expect(appError.technicalDetails).toBe('Original error message');
        // The cause field is removed to prevent circular references
        expect(appError.cause).toBeUndefined();
      });

      test('should generate unique error IDs and codes', () => {
        const error1 = ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.LOW,
          'Error 1',
          { operation: 'test1', component: 'Test' }
        );

        const error2 = ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.LOW,
          'Error 2',
          { operation: 'test2', component: 'Test' }
        );

        expect(error1.id).not.toBe(error2.id);
        expect(error1.code).not.toBe(error2.code);
      });
    });

    describe('MCP Error Conversion', () => {
      test('should convert AppError to McpError with correct error codes', () => {
        const validationError = ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          'Validation failed',
          { operation: 'test', component: 'Test' }
        );

        const mcpError = ErrorHandler.toMcpError(validationError);

        expect(mcpError).toBeInstanceOf(McpError);
        expect(mcpError.code).toBe(ErrorCode.InvalidParams);
        expect(mcpError.message).toContain('Validation failed');
      });

      test('should map different error categories to appropriate MCP codes', () => {
        const testCases = [
          { category: ErrorCategory.VALIDATION, expected: ErrorCode.InvalidParams },
          { category: ErrorCategory.AUTHENTICATION, expected: ErrorCode.InvalidParams },
          { category: ErrorCategory.MCP_PROTOCOL, expected: ErrorCode.MethodNotFound },
          { category: ErrorCategory.OPERATION, expected: ErrorCode.InvalidRequest },
          { category: ErrorCategory.INTERNAL, expected: ErrorCode.InternalError },
          { category: ErrorCategory.UNKNOWN, expected: ErrorCode.InternalError }
        ];

        testCases.forEach(({ category, expected }) => {
          const appError = ErrorHandler.createError(
            category,
            ErrorSeverity.MEDIUM,
            'Test error',
            { operation: 'test', component: 'Test' }
          );

          const mcpError = ErrorHandler.toMcpError(appError);
          expect(mcpError.code).toBe(expected);
        });
      });
    });

    describe('Error Handling with Context', () => {
      test('should handle native Error and enhance with context', () => {
        const nativeError = new Error('Native error message');
        const context: Partial<ErrorContext> = {
          operation: 'test_operation',
          component: 'TestComponent',
          requestId: 'req123'
        };

        const result = ErrorHandler.handleError(nativeError, context, {
          rethrow: false
        }) as AppError;

        expect(result.message).toBe('Native error message');
        expect(result.context.operation).toBe('test_operation');
        expect(result.context.component).toBe('TestComponent');
        expect(result.context.requestId).toBe('req123');
        expect(result.context.originalError).toBe(nativeError);
      });

      test('should pass through AppError unchanged', () => {
        const appError = ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          'Original app error',
          { operation: 'original', component: 'Original' }
        );

        const context: Partial<ErrorContext> = {
          operation: 'handler_operation',
          component: 'HandlerComponent'
        };

        const result = ErrorHandler.handleError(appError, context, {
          rethrow: false
        }) as AppError;

        expect(result).toBe(appError);
      });

      test('should convert to MCP error when requested', () => {
        const nativeError = new Error('Test error');
        const context: Partial<ErrorContext> = {
          operation: 'test',
          component: 'Test'
        };

        const result = ErrorHandler.handleError(nativeError, context, {
          convertToMcp: true,
          rethrow: false
        });

        expect(result).toBeInstanceOf(McpError);
      });

      test('should rethrow error when requested', () => {
        const nativeError = new Error('Test error');
        const context: Partial<ErrorContext> = {
          operation: 'test',
          component: 'Test'
        };

        expect(() => {
          ErrorHandler.handleError(nativeError, context, {
            rethrow: true
          });
        }).toThrow();
      });
    });

    describe('Error Wrapping with Retry Logic', () => {
      test('should execute operation successfully', async () => {
        const mockOperation = jest.fn().mockResolvedValue('success');
        const context: Partial<ErrorContext> = {
          operation: 'test_success',
          component: 'Test'
        };

        const result = await ErrorHandler.withErrorHandling(
          mockOperation,
          context
        );

        expect(result).toBe('success');
        expect(mockOperation).toHaveBeenCalledTimes(1);
      });

      test('should retry operation on failure', async () => {
        const mockOperation = jest.fn()
          .mockRejectedValueOnce(new Error('First failure'))
          .mockResolvedValueOnce('success');

        const context: Partial<ErrorContext> = {
          operation: 'test_retry',
          component: 'Test'
        };

        const result = await ErrorHandler.withErrorHandling(
          mockOperation,
          context,
          { retryCount: 1 }
        );

        expect(result).toBe('success');
        expect(mockOperation).toHaveBeenCalledTimes(2);
      });

      test('should fail after max retries', async () => {
        const mockOperation = jest.fn()
          .mockRejectedValue(new Error('Persistent failure'));

        const context: Partial<ErrorContext> = {
          operation: 'test_failure',
          component: 'Test'
        };

        try {
          await ErrorHandler.withErrorHandling(
            mockOperation,
            context,
            { retryCount: 2 }
          );
          // If we get here, the function didn't throw
          fail('Expected withErrorHandling to throw but it resolved');
        } catch (error) {
          // This is expected behavior
          expect(error).toBeDefined();
          expect(mockOperation).toHaveBeenCalledTimes(3); // Original + 2 retries
        }
      });

      test('should convert to MCP error on final failure', async () => {
        const mockOperation = jest.fn()
          .mockRejectedValue(new Error('Test failure'));

        const context: Partial<ErrorContext> = {
          operation: 'test_mcp_failure',
          component: 'Test'
        };

        await expect(ErrorHandler.withErrorHandling(
          mockOperation,
          context,
          { convertToMcp: true }
        )).rejects.toBeInstanceOf(McpError);
      });
    });

    describe('Error Categorization', () => {
      test('should correctly categorize Kubernetes errors', () => {
        const kubeError = new Error('kubeconfig file not found');
        const context: Partial<ErrorContext> = {
          operation: 'test',
          component: 'Test'
        };

        const appError = ErrorHandler.handleError(kubeError, context, {
          rethrow: false
        }) as AppError;

        expect(appError.category).toBe(ErrorCategory.KUBERNETES);
      });

      test('should correctly categorize network errors', () => {
        const networkError = new Error('connection refused');
        const context: Partial<ErrorContext> = {
          operation: 'test',
          component: 'Test'
        };

        const appError = ErrorHandler.handleError(networkError, context, {
          rethrow: false
        }) as AppError;

        expect(appError.category).toBe(ErrorCategory.NETWORK);
      });

      test('should correctly categorize authentication errors', () => {
        const authError = new Error('unauthorized access');
        const context: Partial<ErrorContext> = {
          operation: 'test',
          component: 'Test'
        };

        const appError = ErrorHandler.handleError(authError, context, {
          rethrow: false
        }) as AppError;

        expect(appError.category).toBe(ErrorCategory.AUTHENTICATION);
      });

      test('should correctly categorize validation errors', () => {
        const validationError = new Error('invalid parameter format');
        const context: Partial<ErrorContext> = {
          operation: 'test',
          component: 'Test'
        };

        const appError = ErrorHandler.handleError(validationError, context, {
          rethrow: false
        }) as AppError;

        expect(appError.category).toBe(ErrorCategory.VALIDATION);
      });

      test('should correctly categorize AI service errors', () => {
        const aiError = new Error('anthropic api key invalid');
        const context: Partial<ErrorContext> = {
          operation: 'test',
          component: 'Test'
        };

        const appError = ErrorHandler.handleError(aiError, context, {
          rethrow: false
        }) as AppError;

        expect(appError.category).toBe(ErrorCategory.AI_SERVICE);
      });
    });

    describe('Error Severity Assessment', () => {
      test('should assign critical severity for critical errors', () => {
        const criticalError = new Error('critical system failure');
        const context: Partial<ErrorContext> = {
          operation: 'test',
          component: 'Test'
        };

        const appError = ErrorHandler.handleError(criticalError, context, {
          rethrow: false
        }) as AppError;

        expect(appError.severity).toBe(ErrorSeverity.CRITICAL);
      });

      test('should assign high severity for authentication errors', () => {
        const authError = new Error('authentication failed');
        const context: Partial<ErrorContext> = {
          operation: 'test',
          component: 'Test'
        };

        const appError = ErrorHandler.handleError(authError, context, {
          rethrow: false
        }) as AppError;

        expect(appError.severity).toBe(ErrorSeverity.HIGH);
      });

      test('should assign medium severity for validation errors', () => {
        const validationError = new Error('validation error');
        const context: Partial<ErrorContext> = {
          operation: 'test',
          component: 'Test'
        };

        const appError = ErrorHandler.handleError(validationError, context, {
          rethrow: false
        }) as AppError;

        expect(appError.severity).toBe(ErrorSeverity.MEDIUM);
      });
    });

    describe('Suggested Actions', () => {
      test('should provide Kubernetes-specific suggestions', () => {
        const appError = ErrorHandler.createError(
          ErrorCategory.KUBERNETES,
          ErrorSeverity.HIGH,
          'Kubernetes error',
          { operation: 'test', component: 'Test' }
        );

        expect(appError.suggestedActions).toContain('Verify kubeconfig file exists and is valid');
        expect(appError.suggestedActions).toContain('Check cluster connectivity with kubectl cluster-info');
      });

      test('should provide validation-specific suggestions', () => {
        const appError = ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          'Validation error',
          { operation: 'test', component: 'Test' }
        );

        expect(appError.suggestedActions).toContain('Review input parameters for correct format');
        expect(appError.suggestedActions).toContain('Check required fields are provided');
      });

      test('should provide AI service-specific suggestions', () => {
        const appError = ErrorHandler.createError(
          ErrorCategory.AI_SERVICE,
          ErrorSeverity.HIGH,
          'AI service error',
          { operation: 'test', component: 'Test' }
        );

        expect(appError.suggestedActions).toContain('Check ANTHROPIC_API_KEY environment variable');
        expect(appError.suggestedActions).toContain('Verify API key is valid and has sufficient credits');
      });

      test('should use custom suggested actions when provided', () => {
        const customActions = ['Custom action 1', 'Custom action 2'];
        const context: Partial<ErrorContext> = {
          operation: 'test',
          component: 'Test',
          suggestedActions: customActions
        };

        const appError = ErrorHandler.createError(
          ErrorCategory.INTERNAL,
          ErrorSeverity.LOW,
          'Test error',
          context
        );

        expect(appError.suggestedActions).toEqual(customActions);
      });
    });

    describe('Request ID Generation', () => {
      test('should generate unique request IDs', () => {
        const id1 = ErrorHandler.generateRequestId();
        const id2 = ErrorHandler.generateRequestId();

        expect(id1).not.toBe(id2);
        expect(id1).toMatch(/^req_\d+_\d+$/);
        expect(id2).toMatch(/^req_\d+_\d+$/);
      });
    });
  });

  describe('ConsoleLogger', () => {
    let consoleSpy: {
      debug: jest.SpyInstance;
      info: jest.SpyInstance;
      warn: jest.SpyInstance;
      error: jest.SpyInstance;
    };

    beforeEach(() => {
      consoleSpy = {
        debug: jest.spyOn(console, 'debug').mockImplementation(),
        info: jest.spyOn(console, 'info').mockImplementation(),
        warn: jest.spyOn(console, 'warn').mockImplementation(),
        error: jest.spyOn(console, 'error').mockImplementation()
      };
    });

    afterEach(() => {
      Object.values(consoleSpy).forEach(spy => spy.mockRestore());
    });

    test('should log at appropriate levels', () => {
      const logger = new ConsoleLogger('TestComponent', LogLevel.DEBUG);

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(consoleSpy.debug).toHaveBeenCalledWith(
        expect.stringContaining('[TestComponent] Debug message')
      );
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[TestComponent] Info message')
      );
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('[TestComponent] Warn message')
      );
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[TestComponent] Error message')
      );
    });

    test('should respect minimum log level', () => {
      const logger = new ConsoleLogger('TestComponent', LogLevel.WARN);

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    test('should format messages with timestamps and component', () => {
      const logger = new ConsoleLogger('TestComponent', LogLevel.INFO);

      logger.info('Test message');

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO \[TestComponent\] Test message$/)
      );
    });

    test('should include data in log messages', () => {
      const logger = new ConsoleLogger('TestComponent', LogLevel.INFO);
      const testData = { key: 'value', number: 42 };

      logger.info('Test message', testData);

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(testData, null, 2))
      );
    });

    test('should serialize errors properly', () => {
      const logger = new ConsoleLogger('TestComponent', LogLevel.ERROR);
      const testError = new Error('Test error');
      const appError = ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        'App error',
        { operation: 'test', component: 'Test' }
      );

      logger.error('Native error', testError);
      logger.error('App error', appError);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('"name": "Error"')
      );
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('"category": "validation"')
      );
    });
  });

  describe('Error Context Tracking', () => {
    test('should preserve context through error chain', () => {
      const originalContext: Partial<ErrorContext> = {
        operation: 'original_operation',
        component: 'OriginalComponent',
        userId: 'user123',
        sessionId: 'session456',
        requestId: 'req789'
      };

      const originalError = ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        'Original error',
        originalContext
      );

      const wrappedContext: Partial<ErrorContext> = {
        operation: 'wrapped_operation',
        component: 'WrapperComponent'
      };

      const wrappedError = ErrorHandler.handleError(originalError, wrappedContext, {
        rethrow: false
      }) as AppError;

      // Original AppError should be passed through unchanged
      expect(wrappedError).toBe(originalError);
      expect(wrappedError.context.operation).toBe('original_operation');
      expect(wrappedError.context.userId).toBe('user123');
    });

    test('should include version and timestamp in context', () => {
      const appError = ErrorHandler.createError(
        ErrorCategory.INTERNAL,
        ErrorSeverity.LOW,
        'Test error',
        { operation: 'test', component: 'Test' }
      );

      expect(appError.context.version).toBeDefined();
      expect(appError.context.timestamp).toBeInstanceOf(Date);
      expect(appError.timestamp).toBeInstanceOf(Date);
    });

    test('should handle retry count in context', () => {
      const context: Partial<ErrorContext> = {
        operation: 'test_retry',
        component: 'Test',
        retryCount: 2,
        isRetryable: true
      };

      const appError = ErrorHandler.createError(
        ErrorCategory.NETWORK,
        ErrorSeverity.MEDIUM,
        'Network error',
        context
      );

      expect(appError.context.retryCount).toBe(2);
      expect(appError.context.isRetryable).toBe(true);
      expect(appError.isRetryable).toBe(true);
    });
  });
});