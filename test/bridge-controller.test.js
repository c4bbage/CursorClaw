import assert from 'node:assert';
import { describe, it } from 'node:test';
import { BridgeController } from '../src/bridge-controller.js';

function createMessage(overrides = {}) {
  return {
    channel: 'feishu',
    scopeKey: 'feishu:chat-1:user-1',
    userKey: 'user-1',
    conversationKey: 'chat-1',
    messageKey: 'message-1',
    text: '你好',
    attachments: [],
    target: {
      channel: 'feishu',
      conversationKey: 'chat-1',
      userKey: 'user-1'
    },
    replyRef: {
      conversationKey: 'chat-1',
      messageKey: 'message-1'
    },
    ...overrides
  };
}

describe('BridgeController', () => {
  it('prompts cursor with channel-aware scope keys', async () => {
    const calls = [];
    const stream = {
      push(text) {
        calls.push({ type: 'push', text });
      },
      async finalize(text) {
        calls.push({ type: 'finalize', text });
      },
      async fail(text) {
        calls.push({ type: 'fail', text });
      }
    };
    const channelAdapter = {
      createStreamHandle() {
        return stream;
      },
      async acknowledge() {},
      async resolvePromptInput(message) {
        return { promptText: message.text, promptOptions: {} };
      },
      async sendText() {
        throw new Error('unexpected sendText');
      },
      async sendFile() {
        throw new Error('unexpected sendFile');
      },
      async replyText() {
        throw new Error('unexpected replyText');
      }
    };
    const cursorSessions = {
      promptCalls: [],
      respondCalls: [],
      on() {},
      async prompt(scopeKey, promptText, options) {
        this.promptCalls.push({ scopeKey, promptText });
        options.onChunk('第一段');
        options.onChunk('第二段');
        return { text: '最终回复' };
      },
      respond(scopeKey, id, result) {
        this.respondCalls.push({ scopeKey, id, result });
      }
    };
    const scheduler = {
      schedule() {},
      list() {
        return [];
      },
      cancel() {
        return false;
      }
    };

    const controller = new BridgeController({ channelAdapter, cursorSessions, scheduler });
    await controller.handleMessage(createMessage());

    assert.deepStrictEqual(cursorSessions.promptCalls, [
      { scopeKey: 'feishu:chat-1:user-1', promptText: '你好' }
    ]);
    assert.strictEqual(calls.at(-1).type, 'finalize');
    assert.strictEqual(calls.at(-1).text, '第一段第二段');
  });

  it('routes pending interactions by scope key', async () => {
    const replies = [];
    const channelAdapter = {
      async acknowledge() {},
      async resolvePromptInput(message) {
        return { promptText: message.text, promptOptions: {} };
      },
      async replyText(_message, text) {
        replies.push(text);
      },
      createStreamHandle() {
        throw new Error('unexpected stream');
      },
      async sendText() {
        throw new Error('unexpected sendText');
      },
      async sendFile() {
        throw new Error('unexpected sendFile');
      }
    };
    const cursorSessions = {
      respondCalls: [],
      on() {},
      async prompt() {
        throw new Error('unexpected prompt');
      },
      respond(scopeKey, id, result) {
        this.respondCalls.push({ scopeKey, id, result });
      }
    };
    const scheduler = {
      schedule() {},
      list() {
        return [];
      },
      cancel() {
        return false;
      }
    };
    const controller = new BridgeController({ channelAdapter, cursorSessions, scheduler });

    controller.pendingInteractions.set('telegram:chat-9:user-9', {
      id: 'req-other',
      method: 'cursor/ask_question',
      params: {
        questions: [{ id: 'q1', prompt: '模式', options: [{ id: 'a', label: 'A' }] }]
      }
    });
    controller.pendingInteractions.set('feishu:chat-1:user-1', {
      id: 'req-1',
      method: 'cursor/create_plan',
      params: { title: '审批' }
    });

    const handled = await controller.handlePendingInteraction(createMessage({ text: '批准' }));

    assert.strictEqual(handled, true);
    assert.deepStrictEqual(cursorSessions.respondCalls, [
      {
        scopeKey: 'feishu:chat-1:user-1',
        id: 'req-1',
        result: { approved: true, decision: 'approved', text: '批准' }
      }
    ]);
    assert.ok(replies[0].includes('已提交给 Cursor'));
    assert.ok(controller.pendingInteractions.has('telegram:chat-9:user-9'));
    assert.strictEqual(controller.pendingInteractions.has('feishu:chat-1:user-1'), false);
  });
});
