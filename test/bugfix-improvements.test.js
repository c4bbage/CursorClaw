import assert from 'node:assert';
import { describe, it } from 'node:test';
import { CursorBridge } from '../src/cursor-bridge.js';
import { BridgeController } from '../src/bridge-controller.js';
import { splitMessage, truncateForTelegram, markdownToTelegramHtml } from '../src/adapters/telegram.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockScheduler() {
  return { schedule() {}, list() { return []; }, cancel() { return false; } };
}

function createMessage(overrides = {}) {
  return {
    channel: 'feishu',
    scopeKey: 'feishu:chat-1:user-1',
    userKey: 'user-1',
    conversationKey: 'chat-1',
    messageKey: 'message-1',
    text: '你好',
    attachments: [],
    target: { channel: 'feishu', conversationKey: 'chat-1', userKey: 'user-1' },
    replyRef: { conversationKey: 'chat-1', messageKey: 'message-1' },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// 1. CursorBridge: _cursor/ prefix normalization
// ---------------------------------------------------------------------------

describe('CursorBridge handles _cursor/ prefixed events', () => {
  it('should normalize _cursor/update_todos to cursor/update_todos and emit', () => {
    const bridge = new CursorBridge({ cwd: '/tmp' });
    const emitted = [];
    bridge.on('cursor_event', (event) => emitted.push(event));

    bridge.handleMessage({
      jsonrpc: '2.0',
      id: 30,
      method: '_cursor/update_todos',
      params: { todos: [{ id: '1', content: 'test', status: 'pending' }] }
    });

    assert.strictEqual(emitted.length, 1);
    assert.strictEqual(emitted[0].method, 'cursor/update_todos');
    assert.strictEqual(emitted[0].id, 30);
    assert.deepStrictEqual(emitted[0].params.todos, [{ id: '1', content: 'test', status: 'pending' }]);
  });

  it('should emit cursor events even when id is 0', () => {
    const bridge = new CursorBridge({ cwd: '/tmp' });
    const emitted = [];
    bridge.on('cursor_event', (event) => emitted.push(event));

    bridge.handleMessage({
      jsonrpc: '2.0',
      id: 0,
      method: '_cursor/update_todos',
      params: { todos: [] }
    });

    assert.strictEqual(emitted.length, 1);
    assert.strictEqual(emitted[0].id, 0);
  });

  it('should resolve pending promises when result is null', () => {
    const bridge = new CursorBridge({ cwd: '/tmp' });
    let resolved = false;
    bridge.pending.set(5, {
      resolve(val) { resolved = true; assert.strictEqual(val, null); },
      reject() { throw new Error('should not reject'); }
    });

    bridge.handleMessage({ jsonrpc: '2.0', id: 5, result: null });

    assert.ok(resolved, 'Promise should resolve even with result: null');
    assert.strictEqual(bridge.pending.size, 0);
  });

  it('should still handle regular cursor/ prefixed events normally', () => {
    const bridge = new CursorBridge({ cwd: '/tmp' });
    const emitted = [];
    bridge.on('cursor_event', (event) => emitted.push(event));

    bridge.handleMessage({
      jsonrpc: '2.0',
      id: 10,
      method: 'cursor/ask_question',
      params: { title: 'Pick one' }
    });

    assert.strictEqual(emitted.length, 1);
    assert.strictEqual(emitted[0].method, 'cursor/ask_question');
  });

  it('should auto-acknowledge unhandled requests that have an id', () => {
    const bridge = new CursorBridge({ cwd: '/tmp' });
    const written = [];
    bridge.process = {
      stdin: {
        write(data) { written.push(JSON.parse(data.trim())); }
      }
    };

    bridge.handleMessage({
      jsonrpc: '2.0',
      id: 99,
      method: 'unknown/future_method',
      params: {}
    });

    assert.strictEqual(written.length, 1);
    assert.strictEqual(written[0].id, 99);
    assert.deepStrictEqual(written[0].result, { acknowledged: true });
  });

  it('should NOT auto-acknowledge notifications (messages without id)', () => {
    const bridge = new CursorBridge({ cwd: '/tmp' });
    const written = [];
    bridge.process = {
      stdin: {
        write(data) { written.push(JSON.parse(data.trim())); }
      }
    };

    bridge.handleMessage({
      jsonrpc: '2.0',
      method: 'unknown/notification',
      params: {}
    });

    assert.strictEqual(written.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 2. BridgeController: cursor events via _cursor/ prefix reach handlers
// ---------------------------------------------------------------------------

describe('BridgeController routes _cursor/ events correctly', () => {
  it('should forward _cursor/update_todos to channel as a todos message', async () => {
    const sentTexts = [];
    const channelAdapter = {
      on() {},
      async sendText(target, text) { sentTexts.push({ target, text }); },
      async sendFile() {},
      async acknowledge() {},
      async resolvePromptInput(msg) { return { promptText: msg.text, promptOptions: {} }; },
      createStreamHandle() { throw new Error('unexpected'); },
      async replyText() {}
    };
    const respondCalls = [];
    const cursorSessions = {
      on() {},
      respond(scopeKey, id, result) { respondCalls.push({ scopeKey, id, result }); }
    };

    const controller = new BridgeController({
      channelAdapter,
      cursorSessions,
      scheduler: createMockScheduler()
    });
    controller.latestTargets.set('feishu:chat-1:user-1', {
      channel: 'feishu', conversationKey: 'chat-1', userKey: 'user-1'
    });

    await controller.handleCursorEvent({
      scopeKey: 'feishu:chat-1:user-1',
      event: {
        id: 30,
        method: 'cursor/update_todos',
        params: {
          todos: [
            { id: '1', content: 'Clone repo', status: 'in_progress' },
            { id: '2', content: 'Install deps', status: 'pending' }
          ]
        }
      }
    });

    assert.strictEqual(sentTexts.length, 1);
    assert.ok(sentTexts[0].text.includes('Clone repo'));
    assert.ok(sentTexts[0].text.includes('Install deps'));
    assert.strictEqual(respondCalls.length, 1);
    assert.strictEqual(respondCalls[0].id, 30);
  });

  it('should acknowledge cursor events with id=0 (falsy but valid)', async () => {
    const respondCalls = [];
    const channelAdapter = {
      on() {},
      async sendText() {},
      async sendFile() {},
      async acknowledge() {},
      async resolvePromptInput(msg) { return { promptText: msg.text, promptOptions: {} }; },
      createStreamHandle() { throw new Error('unexpected'); },
      async replyText() {}
    };
    const cursorSessions = {
      on() {},
      respond(scopeKey, id, result) { respondCalls.push({ scopeKey, id, result }); }
    };

    const controller = new BridgeController({
      channelAdapter,
      cursorSessions,
      scheduler: createMockScheduler()
    });
    controller.latestTargets.set('feishu:chat-1:user-1', {
      channel: 'feishu', conversationKey: 'chat-1', userKey: 'user-1'
    });

    await controller.handleCursorEvent({
      scopeKey: 'feishu:chat-1:user-1',
      event: {
        id: 0,
        method: 'cursor/update_todos',
        params: { todos: [{ id: '1', content: 'Task', status: 'pending' }] }
      }
    });

    assert.strictEqual(respondCalls.length, 1, 'Should acknowledge event with id=0');
    assert.strictEqual(respondCalls[0].id, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. Telegram: message splitting
// ---------------------------------------------------------------------------

describe('Telegram splitMessage', () => {
  it('should return a single chunk for short messages', () => {
    const chunks = splitMessage('Hello world');
    assert.deepStrictEqual(chunks, ['Hello world']);
  });

  it('should split messages exceeding the limit', () => {
    const longText = 'A'.repeat(5000);
    const chunks = splitMessage(longText, 4096);
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every((chunk) => chunk.length <= 4096));
    assert.strictEqual(chunks.join(''), longText);
  });

  it('should prefer splitting at newline boundaries', () => {
    const line1 = 'A'.repeat(3000);
    const line2 = 'B'.repeat(3000);
    const text = `${line1}\n${line2}`;
    const chunks = splitMessage(text, 4096);
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0], line1);
    assert.strictEqual(chunks[1], line2);
  });

  it('should force-split when no suitable newline is found', () => {
    const noNewlines = 'X'.repeat(10000);
    const chunks = splitMessage(noNewlines, 4096);
    assert.ok(chunks.length >= 3);
    assert.ok(chunks.every((chunk) => chunk.length <= 4096));
  });
});

// ---------------------------------------------------------------------------
// 4. Telegram: truncation
// ---------------------------------------------------------------------------

describe('Telegram truncateForTelegram', () => {
  it('should pass through short messages unchanged', () => {
    assert.strictEqual(truncateForTelegram('short'), 'short');
  });

  it('should truncate messages over 4096 chars with a notice', () => {
    const longText = 'Z'.repeat(5000);
    const result = truncateForTelegram(longText);
    assert.ok(result.length <= 4096);
    assert.ok(result.endsWith('[消息过长，已截断]'));
  });
});

// ---------------------------------------------------------------------------
// 5. Telegram: Markdown → HTML conversion
// ---------------------------------------------------------------------------

describe('Telegram markdownToTelegramHtml', () => {
  it('should convert **bold** to <b>bold</b>', () => {
    assert.strictEqual(markdownToTelegramHtml('this is **bold** text'), 'this is <b>bold</b> text');
  });

  it('should convert `inline code` to <code>inline code</code>', () => {
    assert.strictEqual(
      markdownToTelegramHtml('run `npm install` now'),
      'run <code>npm install</code> now'
    );
  });

  it('should convert code blocks to <pre> tags', () => {
    const input = '```javascript\nconsole.log("hi");\n```';
    const result = markdownToTelegramHtml(input);
    assert.ok(result.includes('<pre>'));
    assert.ok(result.includes('console.log'));
    assert.ok(result.includes('</pre>'));
  });

  it('should escape HTML entities in regular text', () => {
    const input = 'if (a < b && c > d) { return true; }';
    const result = markdownToTelegramHtml(input);
    assert.ok(result.includes('&lt;'));
    assert.ok(result.includes('&gt;'));
    assert.ok(result.includes('&amp;'));
    assert.ok(!result.includes(' < '));
  });

  it('should handle mixed markdown correctly', () => {
    const input = '**注意**: 运行 `git clone` 下载仓库';
    const result = markdownToTelegramHtml(input);
    assert.ok(result.includes('<b>注意</b>'));
    assert.ok(result.includes('<code>git clone</code>'));
  });
});

// ---------------------------------------------------------------------------
// 6. Telegram: sendText with HTML fallback (integration-level)
// ---------------------------------------------------------------------------

describe('Telegram sendText with HTML fallback', () => {
  it('should split and send long messages via sendText', async () => {
    const sentMessages = [];
    const mockBot = {
      sendMessage(chatId, text, options) {
        sentMessages.push({ chatId, text, options });
        return Promise.resolve({ message_id: sentMessages.length });
      },
      on() {}
    };

    const { TelegramAdapter } = await import('../src/adapters/telegram.js');
    const adapter = Object.create(TelegramAdapter.prototype);
    adapter.bot = mockBot;

    const line = 'Line content here.\n';
    const longText = line.repeat(300);
    const target = { conversationKey: 'chat-1', userKey: 'user-1' };
    await adapter.sendText(target, longText);

    assert.ok(sentMessages.length >= 2, `Expected multiple messages, got ${sentMessages.length}`);
    assert.strictEqual(sentMessages[0].chatId, 'chat-1');
    for (const msg of sentMessages) {
      assert.ok(msg.text.length <= 4096);
    }
  });

  it('should fall back to plain text when HTML parsing fails', async () => {
    const sentMessages = [];
    let callCount = 0;
    const mockBot = {
      sendMessage(chatId, text, options) {
        callCount++;
        if (options?.parse_mode === 'HTML') {
          return Promise.reject(new Error('Bad Request: can\'t parse entities'));
        }
        sentMessages.push({ chatId, text });
        return Promise.resolve({ message_id: 1 });
      },
      on() {}
    };

    const { TelegramAdapter } = await import('../src/adapters/telegram.js');
    const adapter = Object.create(TelegramAdapter.prototype);
    adapter.bot = mockBot;

    await adapter.sendText({ conversationKey: 'chat-1' }, 'hello **world**');

    assert.ok(callCount >= 2, 'Should have tried HTML first then fallen back');
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].text, 'hello **world**');
  });
});

// ---------------------------------------------------------------------------
// 7. Telegram: typing keepalive in stream handle
// ---------------------------------------------------------------------------

describe('Telegram stream handle typing keepalive', () => {
  it('should send typing actions periodically and stop on finalize', async () => {
    let typingCount = 0;
    const mockBot = {
      sendMessage(chatId, text) {
        return Promise.resolve({ message_id: 42 });
      },
      editMessageText(text, options) {
        return Promise.resolve();
      },
      sendChatAction(chatId, action) {
        if (action === 'typing') typingCount++;
        return Promise.resolve();
      },
      on() {}
    };

    const { TelegramAdapter } = await import('../src/adapters/telegram.js');
    const adapter = Object.create(TelegramAdapter.prototype);
    adapter.bot = mockBot;

    const message = {
      conversationKey: 'chat-1',
      messageKey: '100',
      target: { conversationKey: 'chat-1', userKey: 'user-1' },
      replyRef: { conversationKey: 'chat-1', messageKey: '100' }
    };
    const handle = adapter.createStreamHandle(message);
    handle.push('first chunk');

    await new Promise((resolve) => setTimeout(resolve, 5500));

    assert.ok(typingCount >= 1, `Expected at least 1 typing action, got ${typingCount}`);

    await handle.finalize('final text');

    const countAfterFinalize = typingCount;
    await new Promise((resolve) => setTimeout(resolve, 5000));
    assert.strictEqual(typingCount, countAfterFinalize, 'Typing should stop after finalize');
  });
});

// ---------------------------------------------------------------------------
// 8. Feishu: sendFile validation
// ---------------------------------------------------------------------------

describe('Feishu sendFile validates file before upload', () => {
  it('should throw when file does not exist', async () => {
    const { FeishuAdapter } = await import('../src/adapters/feishu.js');
    const adapter = Object.create(FeishuAdapter.prototype);
    adapter.client = {};

    await assert.rejects(
      () => adapter.sendFile({ userKey: 'user-1' }, '/nonexistent/path/file.txt', 'file.txt'),
      (error) => {
        assert.ok(error.message.includes('文件不存在'));
        return true;
      }
    );
  });
});
