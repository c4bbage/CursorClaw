import TelegramBot from 'node-telegram-bot-api';
import { ChannelAdapter } from '../channels/channel-adapter.js';
import { BOT_COMMANDS } from '../bridge-controller.js';

const STREAM_UPDATE_INTERVAL_MS = 1200;
const STREAM_MIN_DELTA_CHARS = 24;
const STREAM_PLACEHOLDER = '正在思考...';
const STREAM_IN_PROGRESS_SUFFIX = '\n\n[生成中...]';
const TELEGRAM_MESSAGE_LIMIT = 4096;
const TYPING_KEEPALIVE_MS = 4000;

function guessMimeType(filePath) {
  if (filePath.endsWith('.png')) {
    return 'image/png';
  }
  if (filePath.endsWith('.webp')) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

export function truncateForTelegram(text) {
  if (text.length <= TELEGRAM_MESSAGE_LIMIT) {
    return text;
  }
  return text.slice(0, TELEGRAM_MESSAGE_LIMIT - 20) + '\n\n[消息过长，已截断]';
}

export function splitMessage(text, limit = TELEGRAM_MESSAGE_LIMIT) {
  if (text.length <= limit) {
    return [text];
  }
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', limit);
    if (splitAt < limit / 2) {
      splitAt = limit;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, '');
  }
  return chunks;
}

export function markdownToTelegramHtml(text) {
  let result = text;
  result = result.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _lang, code) => `<pre>${code.trimEnd()}</pre>`);
  result = result.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  result = result.replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>');
  return result;
}

async function sendWithHtmlFallback(bot, chatId, text, extra = {}) {
  try {
    return await bot.sendMessage(chatId, markdownToTelegramHtml(text), { ...extra, parse_mode: 'HTML' });
  } catch {
    return await bot.sendMessage(chatId, text, extra);
  }
}

class TelegramStreamHandle {
  constructor(adapter, message) {
    this.adapter = adapter;
    this.message = message;
    this.replyMessageId = null;
    this.pendingText = '';
    this.lastRenderedText = '';
    this.timer = null;
    this.started = false;
    this.updateChain = Promise.resolve();
    this.typingInterval = null;
  }

  startTypingKeepAlive() {
    if (this.typingInterval) {
      return;
    }
    this.typingInterval = setInterval(() => {
      this.adapter.bot.sendChatAction(this.message.conversationKey, 'typing').catch(() => {});
    }, TYPING_KEEPALIVE_MS);
  }

  stopTypingKeepAlive() {
    if (this.typingInterval) {
      clearInterval(this.typingInterval);
      this.typingInterval = null;
    }
  }

  async ensureStarted() {
    if (this.started) {
      return;
    }
    this.started = true;
    this.startTypingKeepAlive();
    try {
      const response = await this.adapter.bot.sendMessage(
        this.message.conversationKey,
        STREAM_PLACEHOLDER,
        { reply_to_message_id: Number(this.message.messageKey) }
      );
      this.replyMessageId = response.message_id;
    } catch (error) {
      console.error('[Telegram] Failed to create stream reply:', error);
    }
    console.log('[Telegram] Stream reply started:', {
      conversationKey: this.message.conversationKey,
      replyMessageId: this.replyMessageId
    });
  }

  push(text) {
    this.pendingText = text;

    if (!this.started) {
      this.updateChain = this.updateChain.then(() => this.ensureStarted());
    }

    const delta = Math.abs(this.pendingText.length - this.lastRenderedText.length);
    if (delta < STREAM_MIN_DELTA_CHARS && this.timer) {
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush(false).catch((error) => {
          console.error('[Telegram] Stream flush failed:', error);
        });
      }, STREAM_UPDATE_INTERVAL_MS);
    }
  }

  async flush(final) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (final) {
      this.stopTypingKeepAlive();
    }

    const baseText = this.pendingText.trim() || STREAM_PLACEHOLDER;
    const rawText = final ? baseText : `${baseText}${STREAM_IN_PROGRESS_SUFFIX}`;
    const nextText = truncateForTelegram(rawText);

    if (!final && nextText === this.lastRenderedText) {
      return;
    }

    this.updateChain = this.updateChain
      .then(async () => {
        await this.ensureStarted();

        if (this.replyMessageId) {
          if (final) {
            await this.editWithHtmlFallback(nextText);
          } else {
            await this.adapter.bot.editMessageText(nextText, {
              chat_id: this.message.conversationKey,
              message_id: this.replyMessageId
            });
          }
          this.lastRenderedText = nextText;
          return;
        }

        if (!final) {
          return;
        }
        console.warn('[Telegram] No reply message for finalize, sending new message');
        const response = await sendWithHtmlFallback(
          this.adapter.bot,
          this.message.conversationKey,
          nextText,
          { reply_to_message_id: Number(this.message.messageKey) }
        );
        this.replyMessageId = response.message_id;
        this.lastRenderedText = nextText;
      })
      .catch((error) => {
        if (final) {
          this.stopTypingKeepAlive();
        }
        console.error('[Telegram] Stream update failed:', {
          final,
          conversationKey: this.message.conversationKey,
          replyMessageId: this.replyMessageId,
          error: error.message || error
        });
      });

    return this.updateChain;
  }

  async editWithHtmlFallback(text) {
    const opts = { chat_id: this.message.conversationKey, message_id: this.replyMessageId };
    try {
      await this.adapter.bot.editMessageText(markdownToTelegramHtml(text), { ...opts, parse_mode: 'HTML' });
    } catch {
      await this.adapter.bot.editMessageText(text, opts);
    }
  }

  async finalize(text) {
    this.pendingText = text;
    await this.flush(true);
  }

  async fail(message) {
    this.pendingText = message;
    await this.flush(true);
  }
}

export class TelegramAdapter extends ChannelAdapter {
  constructor({ token }) {
    super('telegram');
    this.bot = new TelegramBot(token, { polling: true });
    this.setupHandlers();
  }

  setupHandlers() {
    this.bot.on('message', (msg) => {
      const attachments = [];
      const largestPhoto = Array.isArray(msg.photo) && msg.photo.length > 0
        ? msg.photo[msg.photo.length - 1]
        : null;

      if (largestPhoto) {
        attachments.push({ type: 'image', fileId: largestPhoto.file_id });
      }

      if (msg.voice) {
        attachments.push({ type: 'audio', fileId: msg.voice.file_id });
      }

      if (!msg.text && !msg.caption && attachments.length === 0) {
        return;
      }

      this.emitMessage({
        userKey: msg.from.id.toString(),
        conversationKey: msg.chat.id.toString(),
        messageKey: msg.message_id.toString(),
        text: msg.text || msg.caption || (largestPhoto ? '[图片]' : '[语音]'),
        attachments,
        raw: msg
      });
    });
  }

  async acknowledge(message) {
    await this.bot.sendChatAction(message.conversationKey, 'typing');
  }

  async resolvePromptInput(message) {
    const promptOptions = {};
    let promptText = message.text || '';
    const images = message.attachments.filter((attachment) => attachment.type === 'image');
    const audios = message.attachments.filter((attachment) => attachment.type === 'audio');

    if (images.length > 0) {
      promptOptions.images = [];
      for (const image of images) {
        const fileUrl = await this.bot.getFileLink(image.fileId);
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Telegram image download failed: ${response.status}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        promptOptions.images.push({
          mimeType: guessMimeType(fileUrl),
          data: buffer.toString('base64')
        });
      }
      promptText += '\n\n用户附带了图片，请结合图片内容回答。';
    }

    if (audios.length > 0) {
      const audioNotice = '用户发送了语音消息，但当前 Telegram 语音转写未接入，请提醒用户改发文字。';
      promptText = promptText ? `${promptText}\n\n${audioNotice}` : audioNotice;
    }

    return { promptText, promptOptions };
  }

  createStreamHandle(message) {
    return new TelegramStreamHandle(this, message);
  }

  async sendText(target, text) {
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      await sendWithHtmlFallback(this.bot, target.conversationKey, chunk);
    }
  }

  async replyText(message, text) {
    const chunks = splitMessage(text);
    for (let i = 0; i < chunks.length; i++) {
      const extra = i === 0 ? { reply_to_message_id: Number(message.messageKey) } : {};
      await sendWithHtmlFallback(this.bot, message.conversationKey, chunks[i], extra);
    }
  }

  async sendFile(target, filePath, fileName) {
    return this.bot.sendDocument(target.conversationKey, filePath, {}, {
      filename: fileName
    });
  }

  async start() {
    await this.bot.setMyCommands(BOT_COMMANDS).catch((err) => {
      console.error('[Telegram] Failed to register commands:', err.message);
    });
    console.log('[Telegram] Bot started, commands registered:', BOT_COMMANDS.map((c) => '/' + c.command).join(', '));
  }
}
