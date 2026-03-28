/**
 * Unit Tests: Session Event Bus
 *
 * Tests the session event bus interface, in-memory implementation, and singleton management.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  getSessionEventBus,
  setSessionEventBus,
  SESSION_EVENTS,
  SessionEvent,
  SessionEventBus,
  SessionEventType,
  SessionEventHandler,
} from '../../../src/core/session-events';

describe('SessionEventBus', () => {
  let originalBus: SessionEventBus;

  beforeEach(() => {
    originalBus = getSessionEventBus();
  });

  describe('publish and subscribe', () => {
    test('should deliver session-created events to subscribers', () => {
      const bus = getSessionEventBus();
      const handler = vi.fn();
      bus.subscribe(SESSION_EVENTS.SESSION_CREATED, handler);

      const event: SessionEvent = {
        sessionId: 'rem-123',
        toolName: 'remediate',
        status: 'investigating',
        issue: 'pod crash loop',
        timestamp: '2026-03-28T00:00:00.000Z',
      };
      bus.publish(SESSION_EVENTS.SESSION_CREATED, event);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(event);

      bus.unsubscribe(SESSION_EVENTS.SESSION_CREATED, handler);
    });

    test('should deliver session-updated events to subscribers', () => {
      const bus = getSessionEventBus();
      const handler = vi.fn();
      bus.subscribe(SESSION_EVENTS.SESSION_UPDATED, handler);

      const event: SessionEvent = {
        sessionId: 'rem-456',
        toolName: 'remediate',
        status: 'analysis_complete',
        issue: 'OOM kill',
        timestamp: '2026-03-28T00:00:00.000Z',
      };
      bus.publish(SESSION_EVENTS.SESSION_UPDATED, event);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(event);

      bus.unsubscribe(SESSION_EVENTS.SESSION_UPDATED, handler);
    });

    test('should not cross-fire between event types', () => {
      const bus = getSessionEventBus();
      const createdHandler = vi.fn();
      const updatedHandler = vi.fn();
      bus.subscribe(SESSION_EVENTS.SESSION_CREATED, createdHandler);
      bus.subscribe(SESSION_EVENTS.SESSION_UPDATED, updatedHandler);

      const event: SessionEvent = {
        sessionId: 'rem-789',
        toolName: 'remediate',
        status: 'investigating',
        issue: 'test',
        timestamp: '2026-03-28T00:00:00.000Z',
      };
      bus.publish(SESSION_EVENTS.SESSION_CREATED, event);

      expect(createdHandler).toHaveBeenCalledOnce();
      expect(updatedHandler).not.toHaveBeenCalled();

      bus.unsubscribe(SESSION_EVENTS.SESSION_CREATED, createdHandler);
      bus.unsubscribe(SESSION_EVENTS.SESSION_UPDATED, updatedHandler);
    });
  });

  describe('unsubscribe', () => {
    test('should stop delivering events after unsubscribe', () => {
      const bus = getSessionEventBus();
      const handler = vi.fn();
      bus.subscribe(SESSION_EVENTS.SESSION_CREATED, handler);

      const event: SessionEvent = {
        sessionId: 'rem-100',
        toolName: 'remediate',
        status: 'investigating',
        issue: 'test',
        timestamp: '2026-03-28T00:00:00.000Z',
      };

      bus.unsubscribe(SESSION_EVENTS.SESSION_CREATED, handler);
      bus.publish(SESSION_EVENTS.SESSION_CREATED, event);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('setSessionEventBus', () => {
    test('should swap the event bus implementation', () => {
      const mockBus: SessionEventBus = {
        publish: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      };

      setSessionEventBus(mockBus);

      const bus = getSessionEventBus();
      expect(bus).toBe(mockBus);

      const event: SessionEvent = {
        sessionId: 'rem-200',
        toolName: 'query',
        status: 'investigating',
        issue: 'test',
        timestamp: '2026-03-28T00:00:00.000Z',
      };
      bus.publish(SESSION_EVENTS.SESSION_CREATED, event);

      expect(mockBus.publish).toHaveBeenCalledWith(SESSION_EVENTS.SESSION_CREATED, event);

      // Restore original
      setSessionEventBus(originalBus);
    });
  });
});
