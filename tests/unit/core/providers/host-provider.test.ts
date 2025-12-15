import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HostProvider } from '../../../../src/core/providers/host-provider';
import { ToolLoopConfig, AITool } from '../../../../src/core/ai-provider.interface';
import { CURRENT_MODELS } from '../../../../src/core/model-config';

describe('HostProvider', () => {
  let provider: HostProvider;

  beforeEach(() => {
    provider = new HostProvider();
    // Reset the static handler before each test
    provider.setSamplingHandler(undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should identify as host provider', () => {
    expect(provider.getProviderType()).toBe(CURRENT_MODELS.host);
    expect(provider.getModelName()).toBe(CURRENT_MODELS.host);
    expect(provider.getDefaultModel()).toBe(CURRENT_MODELS.host);
  });

  it('should not be initialized by default', () => {
    expect(provider.isInitialized()).toBe(false);
  });

  it('should be initialized after setting sampling handler', () => {
    const mockHandler = vi.fn();
    provider.setSamplingHandler(mockHandler);
    expect(provider.isInitialized()).toBe(true);
  });

  it('should throw error when sending message without handler', async () => {
    await expect(provider.sendMessage('test prompt')).rejects.toThrow(
      'Host provider is not connected to MCP server'
    );
  });

  it('should delegate sendMessage to sampling handler', async () => {
    const mockResponse = {
      content: {
        type: 'text',
        text: 'Response from host'
      }
    };
    const mockHandler = vi.fn().mockResolvedValue(mockResponse);
    provider.setSamplingHandler(mockHandler);

    const result = await provider.sendMessage('test prompt');

    expect(mockHandler).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.objectContaining({
            type: 'text',
            text: 'test prompt'
          })
        })
      ]),
      undefined,
      expect.anything()
    );
    expect(result.content).toEqual('Response from host');
  });

  it('should pass operation and context to sampling handler options', async () => {
    const mockResponse = {
      content: {
        type: 'text',
        text: 'Response'
      }
    };
    const mockHandler = vi.fn().mockResolvedValue(mockResponse);
    provider.setSamplingHandler(mockHandler);

    const operation = 'test-op';
    const context = { user_intent: 'testing' };
    await provider.sendMessage('prompt', operation, context);

    expect(mockHandler).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({
        operation,
        evaluationContext: context
      })
    );
  });

  describe('toolLoop', () => {
    it('should execute a tool and return final response', async () => {
      const tools: AITool[] = [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              arg: { type: 'string' }
            }
          }
        }
      ];

      const toolExecutor = vi.fn().mockResolvedValue({ result: 'success' });

      // Capture messages at the time of call to avoid reference mutation issues
      const capturedCalls: any[] = [];

      const mockHandler = vi.fn().mockImplementation(async (msgs) => {
        capturedCalls.push(JSON.parse(JSON.stringify(msgs)));
        
        if (capturedCalls.length === 1) {
          return {
            content: {
              type: 'text',
              text: 'I will use the test tool.\n```json\n{\n  "tool": "test_tool",\n  "arguments": { "arg": "value" }\n}\n```'
            }
          };
        } else {
          return {
            content: {
              type: 'text',
              text: 'The tool execution was successful.'
            }
          };
        }
      });

      provider.setSamplingHandler(mockHandler as any);

      const config: ToolLoopConfig = {
        systemPrompt: 'System prompt',
        userMessage: 'Run test tool',
        tools,
        toolExecutor
      };

      const result = await provider.toolLoop(config);

      expect(result.finalMessage).toBe('The tool execution was successful.');
      expect(result.iterations).toBe(2);
      expect(toolExecutor).toHaveBeenCalledWith('test_tool', { arg: 'value' });

      // Verify handler calls
      expect(mockHandler).toHaveBeenCalledTimes(2);

      // First call should have user message
      expect(capturedCalls[0]).toHaveLength(1);
      expect(capturedCalls[0][0]).toEqual(expect.objectContaining({ role: 'user', content: expect.objectContaining({ text: 'Run test tool' }) }));

      // Second call should have history: User -> Assistant (Tool Call) -> User (Tool Result)
      expect(capturedCalls[1]).toHaveLength(3);
      expect(capturedCalls[1][1].role).toBe('assistant');
      expect(capturedCalls[1][2].role).toBe('user');
      expect(capturedCalls[1][2].content.text).toContain("Tool 'test_tool' output");
    });

    it('should handle invalid tool calls gracefully', async () => {
       const tools: AITool[] = [];
       const toolExecutor = vi.fn();

       const mockHandler = vi.fn()
        .mockResolvedValueOnce({
          content: {
            type: 'text',
            text: '```json\n{ "tool": "unknown_tool", "arguments": {} }\n```'
          }
        })
        .mockResolvedValueOnce({
           content: {
             type: 'text',
             text: 'Sorry, I made a mistake.'
           }
        });

       provider.setSamplingHandler(mockHandler as any);

       const config: ToolLoopConfig = {
        systemPrompt: 'System prompt',
        userMessage: 'Run unknown tool',
        tools,
        toolExecutor
      };

      const result = await provider.toolLoop(config);
      
      expect(result.finalMessage).toBe('Sorry, I made a mistake.');
      expect(toolExecutor).not.toHaveBeenCalled();
      
      // Verify error message was sent to assistant
      const secondCallMessages = mockHandler.mock.calls[1][0];
      expect(secondCallMessages[2].content.text).toContain("Unknown tool 'unknown_tool'");
    });
  });
});
