import { EventEmitter } from 'events';

export function createScopeKey({ channel, conversationKey, userKey }) {
  return `${channel}:${conversationKey}:${userKey}`;
}

export class ChannelAdapter extends EventEmitter {
  constructor(channelId, options = {}) {
    super();
    this.channelId = channelId;
    this.allowedUsers = options.allowedUsers || null;
    this.allowedChats = options.allowedChats || null;
  }

  isAuthorized(message) {
    if (!this.allowedUsers && !this.allowedChats) {
      return true;
    }
    if (this.allowedUsers && this.allowedUsers.has(message.userKey)) {
      return true;
    }
    if (this.allowedChats && this.allowedChats.has(message.conversationKey)) {
      return true;
    }
    return false;
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
    if (!this.isAuthorized(message)) {
      console.log(`[${this.channelId}] Unauthorized message blocked:`, {
        userKey: message.userKey,
        conversationKey: message.conversationKey
      });
      this.onUnauthorized(message);
      return;
    }
    this.emit('message', this.normalizeInboundMessage(message));
  }

  onUnauthorized(_message) {
    // Subclasses can override to send a rejection reply
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
