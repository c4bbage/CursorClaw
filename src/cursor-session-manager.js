import { EventEmitter } from 'events';
import { CursorBridge } from './cursor-bridge.js';

export class CursorSessionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.cwd = options.cwd || process.cwd();
    this.mcpServers = options.mcpServers;
    this.bridgeFactory = options.bridgeFactory || ((bridgeOptions) => new CursorBridge(bridgeOptions));
    this.sessions = new Map();
    this.sessionPromises = new Map();
  }

  async getSession(userId) {
    const existingSession = this.sessions.get(userId);
    if (existingSession) {
      existingSession.lastUsedAt = Date.now();
      return existingSession;
    }

    const pendingSession = this.sessionPromises.get(userId);
    if (pendingSession) {
      return pendingSession;
    }

    const createSession = this.createSession(userId);
    this.sessionPromises.set(userId, createSession);

    try {
      return await createSession;
    } finally {
      this.sessionPromises.delete(userId);
    }
  }

  async createSession(userId) {
    console.log('[SessionManager] Creating ACP session for user:', userId);
    const bridge = this.bridgeFactory({
      cwd: this.cwd,
      mcpServers: this.mcpServers,
      clientInfo: {
        name: `feishu-cursor-bridge:${userId}`,
        version: '0.1.0'
      }
    });

    await bridge.start();

    const session = {
      userId,
      bridge,
      createdAt: Date.now(),
      lastUsedAt: Date.now()
    };

    bridge.on('cursor_event', (event) => {
      this.emit('cursor_event', { userId, event });
    });

    bridge.on('response', (text) => {
      this.emit('response', { userId, text });
    });

    bridge.on('close', (info) => {
      this.sessions.delete(userId);
      this.emit('session_closed', { userId, ...info });
    });

    this.sessions.set(userId, session);
    return session;
  }

  async prompt(userId, message, options = {}) {
    const session = await this.getSession(userId);
    session.lastUsedAt = Date.now();
    return session.bridge.prompt(message, options);
  }

  respond(userId, id, result) {
    const session = this.sessions.get(userId);
    if (!session) {
      throw new Error(`No active ACP session for user: ${userId}`);
    }

    session.lastUsedAt = Date.now();
    session.bridge.respond(id, result);
  }

  hasSession(userId) {
    return this.sessions.has(userId);
  }

  async stopSession(userId) {
    const session = this.sessions.get(userId);
    if (!session) {
      return;
    }

    session.bridge.stop();
    this.sessions.delete(userId);
  }

  async stopAll() {
    const stopPromises = [];
    for (const userId of this.sessions.keys()) {
      stopPromises.push(this.stopSession(userId));
    }
    await Promise.all(stopPromises);
  }
}
