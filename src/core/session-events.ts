/**
 * Session Event Bus - Real-time event infrastructure for session lifecycle changes
 *
 * Interface-based event bus that broadcasts session state changes for any tool.
 * Default implementation uses in-memory Node.js EventEmitter.
 * Can be swapped to NATS or another external bus via setSessionEventBus().
 *
 * PRD #425: Session List API and SSE Streaming for Remediation Events
 */

import { EventEmitter } from 'events';

/**
 * Event payload for session state changes
 */
export interface SessionEvent {
  sessionId: string;
  toolName: string;
  status: string;
  issue: string;
  timestamp: string;
}

/**
 * Supported event types
 */
export type SessionEventType = 'session-created' | 'session-updated';

/**
 * Event handler function signature
 */
export type SessionEventHandler = (event: SessionEvent) => void;

/**
 * Event name constants
 */
export const SESSION_EVENTS = {
  SESSION_CREATED: 'session-created' as SessionEventType,
  SESSION_UPDATED: 'session-updated' as SessionEventType,
} as const;

/**
 * Abstract event bus interface. Swap implementations by calling setSessionEventBus().
 */
export interface SessionEventBus {
  publish(eventType: SessionEventType, event: SessionEvent): void;
  subscribe(eventType: SessionEventType, handler: SessionEventHandler): void;
  unsubscribe(eventType: SessionEventType, handler: SessionEventHandler): void;
}

/**
 * In-memory implementation using Node.js EventEmitter.
 * Suitable for single-process deployments.
 */
class InMemorySessionEventBus implements SessionEventBus {
  private emitter = new EventEmitter();

  publish(eventType: SessionEventType, event: SessionEvent): void {
    this.emitter.emit(eventType, event);
  }

  subscribe(eventType: SessionEventType, handler: SessionEventHandler): void {
    this.emitter.on(eventType, handler);
  }

  unsubscribe(eventType: SessionEventType, handler: SessionEventHandler): void {
    this.emitter.off(eventType, handler);
  }
}

let instance: SessionEventBus = new InMemorySessionEventBus();

/**
 * Get the active session event bus singleton
 */
export function getSessionEventBus(): SessionEventBus {
  return instance;
}

/**
 * Replace the session event bus implementation (for testing or switching to external bus)
 */
export function setSessionEventBus(bus: SessionEventBus): void {
  instance = bus;
}
