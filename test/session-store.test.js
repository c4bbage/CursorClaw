import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SessionStore } from '../src/session-store.js';

const TEST_STATE_DIR = join(import.meta.dirname, '.tmp-session-store-test');

describe('SessionStore', () => {
  beforeEach(() => {
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true });
    }
  });

  it('returns null when no state file exists', () => {
    const store = new SessionStore(TEST_STATE_DIR);
    assert.strictEqual(store.load(), null);
  });

  it('saves and loads state round-trip', () => {
    const store = new SessionStore(TEST_STATE_DIR);
    const state = {
      sessions: [
        { scopeKey: 'feishu:chat-1:user-1', sessionId: 'sid-1', createdAt: 1000, lastUsedAt: 2000 }
      ],
      targets: {
        'feishu:chat-1:user-1': { channel: 'feishu', conversationKey: 'chat-1', userKey: 'user-1' }
      },
      pendingInteractions: {
        'feishu:chat-1:user-1': { id: 5, method: 'cursor/ask_question', params: { question: 'hello' } }
      },
      voiceMode: { 'feishu:chat-1:user-1': true },
      scheduledTasks: [
        { taskId: 'daily', cron: '0 9 * * *', prompt: 'good morning', scopeKey: 'feishu:chat-1:user-1', target: {} }
      ]
    };

    store.save(state);
    assert.ok(existsSync(join(TEST_STATE_DIR, 'bridge-state.json')));

    const loaded = store.load();
    assert.ok(loaded.savedAt);
    assert.deepStrictEqual(loaded.sessions, state.sessions);
    assert.deepStrictEqual(loaded.targets, state.targets);
    assert.deepStrictEqual(loaded.pendingInteractions, state.pendingInteractions);
    assert.deepStrictEqual(loaded.voiceMode, state.voiceMode);
    assert.deepStrictEqual(loaded.scheduledTasks, state.scheduledTasks);
  });

  it('overwrites previous state on save', () => {
    const store = new SessionStore(TEST_STATE_DIR);

    store.save({ sessions: [{ scopeKey: 'old' }], targets: {}, pendingInteractions: {}, voiceMode: {}, scheduledTasks: [] });
    store.save({ sessions: [{ scopeKey: 'new' }], targets: {}, pendingInteractions: {}, voiceMode: {}, scheduledTasks: [] });

    const loaded = store.load();
    assert.strictEqual(loaded.sessions.length, 1);
    assert.strictEqual(loaded.sessions[0].scopeKey, 'new');
  });

  it('handles corrupt file gracefully', () => {
    mkdirSync(TEST_STATE_DIR, { recursive: true });
    writeFileSync(join(TEST_STATE_DIR, 'bridge-state.json'), 'not json!!!');

    const store = new SessionStore(TEST_STATE_DIR);
    assert.strictEqual(store.load(), null);
  });
});

describe('BridgeController state persistence', () => {
  it('saveState captures targets, pending interactions, and voice modes', async () => {
    const { BridgeController } = await import('../src/bridge-controller.js');

    const channelAdapter = {
      on() {},
      async sendText() {},
      async sendFile() {},
      async replyText() {},
      async acknowledge() {},
      createStreamHandle() { return { push() {}, async finalize() {}, async fail() {} }; },
      async resolvePromptInput(msg) { return { promptText: msg.text, promptOptions: {} }; }
    };
    const cursorSessions = {
      sessions: new Map(),
      on() {},
      async prompt() { return { text: '' }; },
      respond() {}
    };
    const scheduler = {
      schedule() {},
      list() { return []; },
      cancel() { return false; }
    };

    const controller = new BridgeController({
      channelAdapter,
      cursorSessions,
      scheduler,
      stateDir: TEST_STATE_DIR
    });

    controller.latestTargets.set('feishu:c1:u1', { channel: 'feishu', conversationKey: 'c1', userKey: 'u1' });
    controller.voiceMode.set('feishu:c1:u1', true);
    controller.pendingInteractions.set('feishu:c1:u1', {
      id: 3, method: 'cursor/ask_question', params: { question: 'pick one' }
    });

    controller.saveState();

    const store = controller.sessionStore;
    const loaded = store.load();

    assert.ok(loaded);
    assert.deepStrictEqual(loaded.targets, {
      'feishu:c1:u1': { channel: 'feishu', conversationKey: 'c1', userKey: 'u1' }
    });
    assert.deepStrictEqual(loaded.voiceMode, { 'feishu:c1:u1': true });
    assert.deepStrictEqual(loaded.pendingInteractions['feishu:c1:u1'].id, 3);

    rmSync(TEST_STATE_DIR, { recursive: true });
  });

  it('restoreState rehydrates targets, voice modes, and notifies users', async () => {
    const { BridgeController } = await import('../src/bridge-controller.js');

    const sentMessages = [];
    const channelAdapter = {
      on() {},
      async sendText(target, text) { sentMessages.push({ target, text }); },
      async sendFile() {},
      async replyText() {},
      async acknowledge() {},
      createStreamHandle() { return { push() {}, async finalize() {}, async fail() {} }; },
      async resolvePromptInput(msg) { return { promptText: msg.text, promptOptions: {} }; }
    };
    const cursorSessions = {
      sessions: new Map(),
      on() {},
      async prompt() { return { text: '' }; },
      respond() {}
    };
    const scheduler = {
      schedule() {},
      list() { return []; },
      cancel() { return false; }
    };

    mkdirSync(TEST_STATE_DIR, { recursive: true });
    const store = new SessionStore(TEST_STATE_DIR);
    store.save({
      sessions: [{ scopeKey: 'feishu:c1:u1', sessionId: 'sid-1', createdAt: 1000, lastUsedAt: 2000 }],
      targets: { 'feishu:c1:u1': { channel: 'feishu', conversationKey: 'c1', userKey: 'u1' } },
      pendingInteractions: {},
      voiceMode: { 'feishu:c1:u1': true },
      scheduledTasks: []
    });

    const controller = new BridgeController({
      channelAdapter,
      cursorSessions,
      scheduler,
      stateDir: TEST_STATE_DIR
    });

    await controller.restoreState();

    assert.ok(controller.latestTargets.has('feishu:c1:u1'));
    assert.strictEqual(controller.voiceMode.get('feishu:c1:u1'), true);
    assert.ok(sentMessages.some((m) => m.text.includes('重启')));

    rmSync(TEST_STATE_DIR, { recursive: true });
  });
});
