import { EventEmitter } from 'events';

export function createScopeKey({ channel, conversationKey, userKey }) {
  return `${channel}:${conversationKey}:${userKey}`;
}

export class ChannelAdapter extends EventEmitter {
  constructor(channelId) {
    super();
    this.channelId = channelId;
  }

  normalizeInboundMessage(message) {
    const normalized = {
      ...message,
      channel: this.channelId,
      scopeKey: createScopeKey({
        channel: this.channelId,
        conversationKey: message.conversationKey,
        userKey: message.userKey
      }),
      target: {
        channel: this.channelId,
        conversationKey: message.conversationKey,
        userKey: message.userKey
      },
      replyRef: {
        conversationKey: message.conversationKey,
        messageKey: message.messageKey
      }
    };

    return normalized;
  }

  emitMessage(message) {
    this.emit('message', this.normalizeInboundMessage(message));
  }

  async start() {
    throw new Error(`${this.channelId} adapter must implement start()`);
  }

  async acknowledge() {}

  async resolvePromptInput(message) {
    return {
      promptText: message.text || '',
      promptOptions: {}
    };
  }

  createStreamHandle() {
    throw new Error(`${this.channelId} adapter must implement createStreamHandle()`);
  }

  async sendText() {
    throw new Error(`${this.channelId} adapter must implement sendText()`);
  }

  async replyText(message, text) {
    return this.sendText(message.target, text);
  }

  async sendFile() {
    throw new Error(`${this.channelId} adapter must implement sendFile()`);
  }
}
