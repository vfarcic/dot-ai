/**
 * Generic Session Manager
 *
 * Reusable file-based session management for MCP tools
 * Provides CRUD operations with persistent storage
 *
 * Usage:
 *   const manager = new GenericSessionManager<MySessionData>('myprefix', args);
 *   const session = manager.createSession({ myData: 'value' });
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getAndValidateSessionDirectory } from './session-utils';

/**
 * Generic session structure
 * T is the type of data stored in the session
 */
export interface GenericSession<T = any> {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  data: T;
}

/**
 * Generic session manager with file-based storage
 */
export class GenericSessionManager<T = any> {
  private prefix: string;
  private sessionDir: string;
  private sessionsPath: string;

  /**
   * Create a new session manager
   * @param prefix - Prefix for session IDs and directory (e.g., 'proj', 'pattern', 'test')
   */
  constructor(prefix: string) {
    this.prefix = prefix;
    this.sessionDir = getAndValidateSessionDirectory(true);
    this.sessionsPath = path.join(this.sessionDir, `${prefix}-sessions`);

    // Create sessions directory if it doesn't exist
    if (!fs.existsSync(this.sessionsPath)) {
      fs.mkdirSync(this.sessionsPath, { recursive: true });
    }
  }

  /**
   * Create a new session
   * Pattern: {prefix}-{timestamp}-{uuid}
   */
  createSession(initialData: T = {} as T): GenericSession<T> {
    const sessionId = `${this.prefix}-${Date.now()}-${randomUUID().substring(0, 8)}`;
    const now = new Date().toISOString();

    const session: GenericSession<T> = {
      sessionId,
      createdAt: now,
      updatedAt: now,
      data: initialData,
    };

    this.saveSession(session);

    return session;
  }

  /**
   * Get an existing session
   */
  getSession(sessionId: string): GenericSession<T> | null {
    try {
      const sessionFile = path.join(this.sessionsPath, `${sessionId}.json`);

      if (!fs.existsSync(sessionFile)) {
        return null;
      }

      const sessionData = fs.readFileSync(sessionFile, 'utf8');
      return JSON.parse(sessionData) as GenericSession<T>;
    } catch (error) {
      console.error(`Failed to load session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Update session data (merges with existing data)
   */
  updateSession(sessionId: string, newData: Partial<T>): GenericSession<T> | null {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    session.data = { ...session.data, ...newData };
    session.updatedAt = new Date().toISOString();

    this.saveSession(session);

    return session;
  }

  /**
   * Replace session data entirely
   */
  replaceSession(sessionId: string, newData: T): GenericSession<T> | null {
    const session = this.getSession(sessionId);
    if (!session) {
      return null;
    }

    session.data = newData;
    session.updatedAt = new Date().toISOString();

    this.saveSession(session);

    return session;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    try {
      const sessionFile = path.join(this.sessionsPath, `${sessionId}.json`);

      if (!fs.existsSync(sessionFile)) {
        return false;
      }

      fs.unlinkSync(sessionFile);
      return true;
    } catch (error) {
      console.error(`Failed to delete session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * List all sessions (returns session IDs)
   */
  listSessions(): string[] {
    try {
      if (!fs.existsSync(this.sessionsPath)) {
        return [];
      }

      return fs
        .readdirSync(this.sessionsPath)
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.replace('.json', ''));
    } catch (error) {
      console.error('Failed to list sessions:', error);
      return [];
    }
  }

  /**
   * Clear all sessions (useful for testing)
   */
  clearAllSessions(): void {
    try {
      if (!fs.existsSync(this.sessionsPath)) {
        return;
      }

      const sessions = fs.readdirSync(this.sessionsPath);
      for (const file of sessions) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.sessionsPath, file));
        }
      }
    } catch (error) {
      console.error('Failed to clear sessions:', error);
    }
  }

  /**
   * Save session to file
   *
   * Note: Uses a custom replacer to convert undefined values to null.
   * This is critical because JSON.stringify drops undefined values entirely,
   * which would cause data loss in toolCallsExecuted arrays where tool
   * outputs may have undefined fields. (PRD #320 Milestone 2.5)
   */
  private saveSession(session: GenericSession<T>): void {
    const sessionFile = path.join(this.sessionsPath, `${session.sessionId}.json`);
    // Convert undefined to null to preserve structure during JSON serialization
    const replacer = (_key: string, value: unknown) => value === undefined ? null : value;
    fs.writeFileSync(sessionFile, JSON.stringify(session, replacer, 2), 'utf8');
  }
}
