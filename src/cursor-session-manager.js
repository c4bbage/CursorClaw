import { EventEmitter } from 'events';
import { CursorBridge } from './cursor-bridge.js';
import { HookRunner } from './hook-runner.js';

export class CursorSessionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.cwd = options.cwd || process.cwd();
    this.mcpServers = options.mcpServers;
    this.model = options.model || null;
    this.hookRunner = options.hookRunner !== false ? new HookRunner({ projectDir: this.cwd }) : null;
    this.bridgeFactory = options.bridgeFactory || ((bridgeOptions) => new CursorBridge(bridgeOptions));
    this.sessions = new Map();
    this.sessionPromises = new Map();
  }

  async getSession(scopeKey) {
    const existingSession = this.sessions.get(scopeKey);
    if (existingSession) {
      existingSession.lastUsedAt = Date.now();
      return existingSession;
    }

    const pendingSession = this.sessionPromises.get(scopeKey);
    if (pendingSession) {
      return pendingSession;
    }

    const createSession = this.createSession(scopeKey);
    this.sessionPromises.set(scopeKey, createSession);

    try {
      return await createSession;
    } finally {
      this.sessionPromises.delete(scopeKey);
    }
  }

  async createSession(scopeKey) {
    console.log('[SessionManager] Creating ACP session for scope:', scopeKey);
    const bridge = this.bridgeFactory({
      cwd: this.cwd,
      mcpServers: this.mcpServers,
      model: this.model,
      hookRunner: this.hookRunner,
      clientInfo: {
        name: `channel-bridge:${scopeKey}`,
        version: '0.1.0'
      }
    });

    await bridge.start();

    const session = {
      scopeKey,
      bridge,
      createdAt: Date.now(),
      lastUsedAt: Date.now()
    };

    bridge.on('cursor_event', (event) => {
      this.emit('cursor_event', { scopeKey, event });
    });

    bridge.on('response', (text) => {
      this.emit('response', { scopeKey, text });
    });

    bridge.on('close', (info) => {
      this.sessions.delete(scopeKey);
      this.emit('session_closed', { scopeKey, ...info });
    });

    this.sessions.set(scopeKey, session);
    return session;
  }

  async prompt(scopeKey, message, options = {}) {
    const session = await this.getSession(scopeKey);
    session.lastUsedAt = Date.now();
    return session.bridge.prompt(message, options);
  }

  respond(scopeKey, id, result) {
    const session = this.sessions.get(scopeKey);
    if (!session) {
      throw new Error(`No active ACP session for scope: ${scopeKey}`);
    }

    session.lastUsedAt = Date.now();
    session.bridge.respond(id, result);
  }

  hasSession(scopeKey) {
    return this.sessions.has(scopeKey);
  }

  cancelPrompt(scopeKey) {
    const session = this.sessions.get(scopeKey);
    if (!session) {
      return false;
    }
    session.bridge.cancelCurrentPrompt();
    return true;
  }

  async destroySession(scopeKey) {
    const session = this.sessions.get(scopeKey);
    if (!session) {
      return false;
    }
    console.log('[SessionManager] Destroying session:', scopeKey);
    session.bridge.stop();
    this.sessions.delete(scopeKey);
    return true;
  }

  async stopSession(scopeKey) {
    return this.destroySession(scopeKey);
  }

  async stopAll() {
    const stopPromises = [];
    for (const scopeKey of this.sessions.keys()) {
      stopPromises.push(this.stopSession(scopeKey));
    }
    await Promise.all(stopPromises);
  }
}
