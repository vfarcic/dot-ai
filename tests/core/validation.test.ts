import { SchemaValidator, MCPToolSchemas, JSONSchema, ValidationError } from '../../src/core/validation';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

describe('Schema Validation System', () => {
  describe('SchemaValidator', () => {
    describe('Basic Type Validation', () => {
      test('should validate string type', () => {
        const schema: JSONSchema = { type: 'string' };
        
        expect(SchemaValidator.validate('hello', schema)).toEqual([]);
        expect(SchemaValidator.validate(123, schema)).toEqual([
          { path: 'root', message: "Expected type 'string' but got 'number'", value: 123 }
        ]);
      });

      test('should validate number type', () => {
        const schema: JSONSchema = { type: 'number' };
        
        expect(SchemaValidator.validate(123, schema)).toEqual([]);
        expect(SchemaValidator.validate(123.45, schema)).toEqual([]);
        expect(SchemaValidator.validate('123', schema)).toEqual([
          { path: 'root', message: "Expected type 'number' but got 'string'", value: '123' }
        ]);
      });

      test('should validate integer type', () => {
        const schema: JSONSchema = { type: 'integer' };
        
        expect(SchemaValidator.validate(123, schema)).toEqual([]);
        expect(SchemaValidator.validate(123.45, schema)).toEqual([
          { path: 'root', message: 'Expected integer', value: 123.45 }
        ]);
      });

      test('should validate boolean type', () => {
        const schema: JSONSchema = { type: 'boolean' };
        
        expect(SchemaValidator.validate(true, schema)).toEqual([]);
        expect(SchemaValidator.validate(false, schema)).toEqual([]);
        expect(SchemaValidator.validate('true', schema)).toEqual([
          { path: 'root', message: "Expected type 'boolean' but got 'string'", value: 'true' }
        ]);
      });

      test('should validate array type', () => {
        const schema: JSONSchema = { type: 'array' };
        
        expect(SchemaValidator.validate([], schema)).toEqual([]);
        expect(SchemaValidator.validate([1, 2, 3], schema)).toEqual([]);
        expect(SchemaValidator.validate('not array', schema)).toEqual([
          { path: 'root', message: "Expected type 'array' but got 'string'", value: 'not array' }
        ]);
      });

      test('should validate object type', () => {
        const schema: JSONSchema = { type: 'object' };
        
        expect(SchemaValidator.validate({}, schema)).toEqual([]);
        expect(SchemaValidator.validate({ a: 1 }, schema)).toEqual([]);
        expect(SchemaValidator.validate('not object', schema)).toEqual([
          { path: 'root', message: "Expected type 'object' but got 'string'", value: 'not object' }
        ]);
      });
    });

    describe('Object Validation', () => {
      test('should validate object properties', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' }
          }
        };

        const validData = { name: 'John', age: 30 };
        expect(SchemaValidator.validate(validData, schema)).toEqual([]);

        const invalidData = { name: 123, age: 'thirty' };
        const errors = SchemaValidator.validate(invalidData, schema);
        expect(errors).toHaveLength(2);
        expect(errors[0].path).toBe('root.name');
        expect(errors[1].path).toBe('root.age');
      });

      test('should validate required properties', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' }
          },
          required: ['name', 'email']
        };

        const validData = { name: 'John', email: 'john@example.com' };
        expect(SchemaValidator.validate(validData, schema)).toEqual([]);

        const missingRequired = { name: 'John' };
        const errors = SchemaValidator.validate(missingRequired, schema);
        expect(errors).toHaveLength(1);
        expect(errors[0].path).toBe('root.email');
        expect(errors[0].message).toBe('Required property is missing');
      });

      test('should handle nested objects', () => {
        const schema: JSONSchema = {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' }
              },
              required: ['name']
            }
          }
        };

        const validData = { user: { name: 'John', age: 30 } };
        expect(SchemaValidator.validate(validData, schema)).toEqual([]);

        const invalidData = { user: { age: 30 } };
        const errors = SchemaValidator.validate(invalidData, schema);
        expect(errors).toHaveLength(1);
        expect(errors[0].path).toBe('root.user.name');
      });
    });

    describe('Array Validation', () => {
      test('should validate array items', () => {
        const schema: JSONSchema = {
          type: 'array',
          items: { type: 'string' }
        };

        expect(SchemaValidator.validate(['a', 'b', 'c'], schema)).toEqual([]);

        const invalidData = ['a', 123, 'c'];
        const errors = SchemaValidator.validate(invalidData, schema);
        expect(errors).toHaveLength(1);
        expect(errors[0].path).toBe('root[1]');
        expect(errors[0].message).toBe("Expected type 'string' but got 'number'");
      });

      test('should validate array of objects', () => {
        const schema: JSONSchema = {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' }
            },
            required: ['id']
          }
        };

        const validData = [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' }
        ];
        expect(SchemaValidator.validate(validData, schema)).toEqual([]);

        const invalidData = [
          { id: 1, name: 'Item 1' },
          { name: 'Item 2' } // Missing required id
        ];
        const errors = SchemaValidator.validate(invalidData, schema);
        expect(errors).toHaveLength(1);
        expect(errors[0].path).toBe('root[1].id');
      });
    });

    describe('String Validation', () => {
      test('should validate string length', () => {
        const schema: JSONSchema = {
          type: 'string',
          minLength: 2,
          maxLength: 10
        };

        expect(SchemaValidator.validate('hello', schema)).toEqual([]);
        
        const tooShort = SchemaValidator.validate('a', schema);
        expect(tooShort).toHaveLength(1);
        expect(tooShort[0].message).toBe('String length must be at least 2');

        const tooLong = SchemaValidator.validate('this is too long', schema);
        expect(tooLong).toHaveLength(1);
        expect(tooLong[0].message).toBe('String length must be at most 10');
      });

      test('should validate string pattern', () => {
        const schema: JSONSchema = {
          type: 'string',
          pattern: '^[a-z]+$'
        };

        expect(SchemaValidator.validate('hello', schema)).toEqual([]);
        
        const invalidPattern = SchemaValidator.validate('Hello123', schema);
        expect(invalidPattern).toHaveLength(1);
        expect(invalidPattern[0].message).toBe('String does not match pattern: ^[a-z]+$');
      });
    });

    describe('Number Validation', () => {
      test('should validate number range', () => {
        const schema: JSONSchema = {
          type: 'number',
          minimum: 0,
          maximum: 100
        };

        expect(SchemaValidator.validate(50, schema)).toEqual([]);
        
        const tooSmall = SchemaValidator.validate(-1, schema);
        expect(tooSmall).toHaveLength(1);
        expect(tooSmall[0].message).toBe('Number must be at least 0');

        const tooLarge = SchemaValidator.validate(101, schema);
        expect(tooLarge).toHaveLength(1);
        expect(tooLarge[0].message).toBe('Number must be at most 100');
      });
    });

    describe('Enum Validation', () => {
      test('should validate enum values', () => {
        const schema: JSONSchema = {
          type: 'string',
          enum: ['red', 'green', 'blue']
        };

        expect(SchemaValidator.validate('red', schema)).toEqual([]);
        
        const invalidEnum = SchemaValidator.validate('yellow', schema);
        expect(invalidEnum).toHaveLength(1);
        expect(invalidEnum[0].message).toBe('Value must be one of: red, green, blue');
      });
    });

    describe('Null/Undefined Handling', () => {
      test('should handle null values', () => {
        const schema: JSONSchema = { type: 'string' };
        
        const errors = SchemaValidator.validate(null, schema);
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toBe('Value is required but null/undefined');
      });

      test('should handle undefined values', () => {
        const schema: JSONSchema = { type: 'string' };
        
        const errors = SchemaValidator.validate(undefined, schema);
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toBe('Value is required but null/undefined');
      });
    });
  });

  describe('MCP Tool Input Validation', () => {
    test('should validate recommend tool input', () => {
      const validInput = { intent: 'Deploy a web application' };
      expect(() => SchemaValidator.validateToolInput('recommend', validInput, MCPToolSchemas.RECOMMEND_INPUT))
        .not.toThrow();

      const invalidInput = { intent: 123 };
      expect(() => SchemaValidator.validateToolInput('recommend', invalidInput, MCPToolSchemas.RECOMMEND_INPUT))
        .toThrow(McpError);

      const missingInput = {};
      expect(() => SchemaValidator.validateToolInput('recommend', missingInput, MCPToolSchemas.RECOMMEND_INPUT))
        .toThrow(McpError);
    });

    test('should validate enhance_solution tool input', () => {
      const validInput = { solution_data: '{"test": "data"}' };
      expect(() => SchemaValidator.validateToolInput('enhance_solution', validInput, MCPToolSchemas.ENHANCE_SOLUTION_INPUT))
        .not.toThrow();

      const invalidInput = { solution_data: 123 };
      expect(() => SchemaValidator.validateToolInput('enhance_solution', invalidInput, MCPToolSchemas.ENHANCE_SOLUTION_INPUT))
        .toThrow(McpError);

      const emptyInput = { solution_data: '' };
      expect(() => SchemaValidator.validateToolInput('enhance_solution', emptyInput, MCPToolSchemas.ENHANCE_SOLUTION_INPUT))
        .toThrow(McpError);
    });

    test('should provide detailed error messages for invalid input', () => {
      const invalidInput = { intent: '' }; // Empty string violates minLength
      
      try {
        SchemaValidator.validateToolInput('recommend', invalidInput, MCPToolSchemas.RECOMMEND_INPUT);
        fail('Expected McpError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
        expect((error as McpError).message).toContain('Invalid parameters for tool \'recommend\'');
        expect((error as McpError).message).toContain('String length must be at least 1');
      }
    });
  });

  describe('MCP Tool Output Validation', () => {
    test('should validate MCP response output', () => {
      const validOutput = {
        content: [
          { type: 'text', text: 'Valid response' }
        ]
      };
      expect(() => SchemaValidator.validateToolOutput('test', validOutput, MCPToolSchemas.MCP_RESPONSE_OUTPUT))
        .not.toThrow();

      const invalidOutput = {
        content: [
          { type: 'invalid', text: 'Bad type' }
        ]
      };
      expect(() => SchemaValidator.validateToolOutput('test', invalidOutput, MCPToolSchemas.MCP_RESPONSE_OUTPUT))
        .toThrow(McpError);

      const missingContent = { data: 'missing content field' };
      expect(() => SchemaValidator.validateToolOutput('test', missingContent, MCPToolSchemas.MCP_RESPONSE_OUTPUT))
        .toThrow(McpError);
    });

    test('should validate solution data structure', () => {
      const validSolution = {
        type: 'single',
        score: 85,
        description: 'Test solution',
        questions: {
          open: {
            question: 'Any requirements?',
            placeholder: 'Enter details...',
            answer: 'I need high availability'
          }
        }
      };

      expect(SchemaValidator.validate(validSolution, MCPToolSchemas.SOLUTION_DATA)).toEqual([]);

      const invalidSolution = {
        type: 'invalid-type', // Not in enum
        score: 150, // Exceeds maximum
        questions: {
          open: {
            // Missing required answer field
            question: 'Any requirements?'
          }
        }
      };

      const errors = SchemaValidator.validate(invalidSolution, MCPToolSchemas.SOLUTION_DATA);
      expect(errors.length).toBeGreaterThan(0);
    });

    test('should provide detailed error messages for invalid output', () => {
      const invalidOutput = {
        content: [
          { type: 'text', text: '' } // Empty text violates minLength
        ]
      };
      
      try {
        SchemaValidator.validateToolOutput('test', invalidOutput, MCPToolSchemas.MCP_RESPONSE_OUTPUT);
        fail('Expected McpError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InternalError);
        expect((error as McpError).message).toContain('Invalid output from tool \'test\'');
        expect((error as McpError).message).toContain('String length must be at least 1');
      }
    });
  });

  describe('MCPToolSchemas', () => {
    test('should provide correct input schema for recommend tool', () => {
      const schema = MCPToolSchemas.getInputSchema('recommend');
      expect(schema).toBe(MCPToolSchemas.RECOMMEND_INPUT);
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('intent');
    });

    test('should provide correct input schema for enhance_solution tool', () => {
      const schema = MCPToolSchemas.getInputSchema('enhance_solution');
      expect(schema).toBe(MCPToolSchemas.ENHANCE_SOLUTION_INPUT);
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('solution_data');
    });

    test('should throw error for unknown tool', () => {
      expect(() => MCPToolSchemas.getInputSchema('unknown_tool'))
        .toThrow('Unknown tool: unknown_tool');
    });

    test('should provide correct output schema', () => {
      const schema = MCPToolSchemas.getOutputSchema();
      expect(schema).toBe(MCPToolSchemas.MCP_RESPONSE_OUTPUT);
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('content');
    });
  });

  describe('Complex Validation Scenarios', () => {
    test('should handle deeply nested validation errors', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  settings: {
                    type: 'object',
                    properties: {
                      theme: { type: 'string', enum: ['light', 'dark'] }
                    },
                    required: ['theme']
                  }
                },
                required: ['settings']
              }
            },
            required: ['profile']
          }
        },
        required: ['user']
      };

      const invalidData = {
        user: {
          profile: {
            settings: {
              theme: 'invalid-theme'
            }
          }
        }
      };

      const errors = SchemaValidator.validate(invalidData, schema);
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toBe('root.user.profile.settings.theme');
      expect(errors[0].message).toBe('Value must be one of: light, dark');
    });

    test('should collect multiple validation errors', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2 },
          age: { type: 'number', minimum: 0, maximum: 150 },
          email: { type: 'string', pattern: '^[^@]+@[^@]+\\.[^@]+$' },
          tags: {
            type: 'array',
            items: { type: 'string', minLength: 1 }
          }
        },
        required: ['name', 'age', 'email']
      };

      const invalidData = {
        name: 'A', // Too short
        age: -5, // Below minimum
        email: 'invalid-email', // Invalid pattern
        tags: ['valid', ''] // One invalid item
      };

      const errors = SchemaValidator.validate(invalidData, schema);
      expect(errors).toHaveLength(4);
      
      const errorMessages = errors.map(e => e.message);
      expect(errorMessages).toContain('String length must be at least 2');
      expect(errorMessages).toContain('Number must be at least 0');
      expect(errorMessages).toContain('String does not match pattern: ^[^@]+@[^@]+\\.[^@]+$');
      expect(errorMessages).toContain('String length must be at least 1');
    });

    test('should handle validation with optional properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          optional_field: { type: 'number' }
        },
        required: ['name']
      };

      // Valid without optional field
      expect(SchemaValidator.validate({ name: 'test' }, schema)).toEqual([]);
      
      // Valid with optional field
      expect(SchemaValidator.validate({ name: 'test', optional_field: 42 }, schema)).toEqual([]);
      
      // Invalid optional field type
      const errors = SchemaValidator.validate({ name: 'test', optional_field: 'not a number' }, schema);
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toBe('root.optional_field');
    });
  });

  describe('Open Question Enforcement', () => {
    describe('validateSolutionData method', () => {
      test('should accept valid solution with meaningful open answer', () => {
        const validSolution = {
          type: 'single',
          description: 'Test solution',
          questions: {
            open: {
              question: 'Any requirements?',
              placeholder: 'Enter details...',
              answer: 'I need high availability and load balancing'
            }
          }
        };

        const errors = SchemaValidator.validateSolutionData(validSolution);
        expect(errors).toEqual([]);
      });

      test('should accept "none" as valid open answer', () => {
        const solutionWithNone = {
          type: 'single',
          description: 'Test solution',
          questions: {
            open: {
              question: 'Any requirements?',
              placeholder: 'Enter details...',
              answer: 'none'
            }
          }
        };

        const errors = SchemaValidator.validateSolutionData(solutionWithNone);
        expect(errors).toEqual([]);
      });

      test('should accept "n/a" as valid open answer', () => {
        const solutionWithNA = {
          type: 'single',
          description: 'Test solution',
          questions: {
            open: {
              question: 'Any requirements?',
              placeholder: 'Enter details...',
              answer: 'n/a'
            }
          }
        };

        const errors = SchemaValidator.validateSolutionData(solutionWithNA);
        expect(errors).toEqual([]);
      });

      test('should reject empty string as open answer', () => {
        const solutionWithEmpty = {
          type: 'single',
          description: 'Test solution',
          questions: {
            open: {
              question: 'Any requirements?',
              placeholder: 'Enter details...',
              answer: ''
            }
          }
        };

        const errors = SchemaValidator.validateSolutionData(solutionWithEmpty);
        expect(errors.length).toBeGreaterThanOrEqual(1);
        
        // Should have at least one error about empty answer
        const emptyAnswerError = errors.find(e => e.message.includes('Open question answer cannot be empty'));
        expect(emptyAnswerError).toBeDefined();
        expect(emptyAnswerError!.path).toBe('solution_data.questions.open.answer');
        expect(emptyAnswerError!.message).toContain('Use "none" or "n/a"');
      });

      test('should reject whitespace-only string as open answer', () => {
        const solutionWithWhitespace = {
          type: 'single',
          description: 'Test solution',
          questions: {
            open: {
              question: 'Any requirements?',
              placeholder: 'Enter details...',
              answer: '   \t\n   '
            }
          }
        };

        const errors = SchemaValidator.validateSolutionData(solutionWithWhitespace);
        expect(errors).toHaveLength(1);
        expect(errors[0].path).toBe('solution_data.questions.open.answer');
        expect(errors[0].message).toContain('Open question answer cannot be empty');
      });

      test('should reject missing answer field', () => {
        const solutionMissingAnswer = {
          type: 'single',
          description: 'Test solution',
          questions: {
            open: {
              question: 'Any requirements?',
              placeholder: 'Enter details...'
              // Missing answer field
            }
          }
        };

        const errors = SchemaValidator.validateSolutionData(solutionMissingAnswer);
        expect(errors).toHaveLength(1);
        expect(errors[0].path).toBe('solution_data.questions.open.answer');
        expect(errors[0].message).toBe('Required property is missing');
      });

      test('should handle solution without questions field', () => {
        const solutionWithoutQuestions = {
          type: 'single',
          description: 'Test solution'
        };

        const errors = SchemaValidator.validateSolutionData(solutionWithoutQuestions);
        expect(errors).toHaveLength(1);
        expect(errors[0].path).toBe('solution_data.questions');
        expect(errors[0].message).toBe('Required property is missing');
      });

      test('should accept mixed case variations of "none" and "n/a"', () => {
        const testCases = ['None', 'NONE', 'N/A', 'n/A', 'N/a'];
        
        testCases.forEach(answer => {
          const solution = {
            type: 'single',
            description: 'Test solution',
            questions: {
              open: {
                question: 'Any requirements?',
                answer: answer
              }
            }
          };

          const errors = SchemaValidator.validateSolutionData(solution);
          expect(errors).toEqual([]);
        });
      });
    });
  });
});