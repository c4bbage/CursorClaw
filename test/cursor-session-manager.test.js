import assert from 'node:assert';
import { EventEmitter } from 'events';
import { describe, it } from 'node:test';
import { CursorSessionManager } from '../src/cursor-session-manager.js';

class FakeBridge extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.promptCalls = [];
    this.respondCalls = [];
    this.stopped = false;
  }

  async start() {
    this.started = true;
  }

  async prompt(message) {
    this.promptCalls.push(message);
    return { text: `echo:${message}` };
  }

  respond(id, result) {
    this.respondCalls.push({ id, result });
  }

  stop() {
    this.stopped = true;
  }
}

describe('CursorSessionManager', () => {
  it('isolates sessions by channel-aware scope key', async () => {
    const bridges = [];
    const manager = new CursorSessionManager({
      bridgeFactory(options) {
        const bridge = new FakeBridge(options);
        bridges.push(bridge);
        return bridge;
      }
    });

    const feishuScope = 'feishu:chat-1:user-1';
    const telegramScope = 'telegram:chat-1:user-1';
    await manager.prompt(feishuScope, 'hello');
    await manager.prompt(telegramScope, 'world');

    assert.strictEqual(bridges.length, 2);
    assert.strictEqual(bridges[0].options.clientInfo.name, `channel-bridge:${feishuScope}`);
    assert.strictEqual(bridges[1].options.clientInfo.name, `channel-bridge:${telegramScope}`);
    assert.strictEqual(manager.hasSession(feishuScope), true);
    assert.strictEqual(manager.hasSession(telegramScope), true);
  });

  it('routes cursor events and responses with the same scope key', async () => {
    const events = [];
    const manager = new CursorSessionManager({
      bridgeFactory(options) {
        return new FakeBridge(options);
      }
    });

    manager.on('cursor_event', (event) => {
      events.push(event);
    });

    const scopeKey = 'feishu:chat-2:user-2';
    const session = await manager.getSession(scopeKey);
    session.bridge.emit('cursor_event', { method: 'cursor/task', params: { description: 'x' } });
    manager.respond(scopeKey, 'req-1', { acknowledged: true });

    assert.deepStrictEqual(events, [
      {
        scopeKey,
        event: { method: 'cursor/task', params: { description: 'x' } }
      }
    ]);
    assert.deepStrictEqual(session.bridge.respondCalls, [
      { id: 'req-1', result: { acknowledged: true } }
    ]);
  });
});
