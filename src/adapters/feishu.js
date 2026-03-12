import { Client, WSClient, EventDispatcher } from '@larksuiteoapi/node-sdk';
import { ChannelAdapter } from '../channels/channel-adapter.js';

const STREAM_UPDATE_INTERVAL_MS = 1200;
const STREAM_MIN_DELTA_CHARS = 24;
const STREAM_PLACEHOLDER = '正在思考...';
const STREAM_IN_PROGRESS_SUFFIX = '\n\n[生成中...]';

class FeishuStreamHandle {
  constructor(adapter, sourceMessageId) {
    this.adapter = adapter;
    this.sourceMessageId = sourceMessageId;
    this.replyMessageId = null;
    this.timer = null;
    this.pendingText = '';
    this.lastRenderedText = '';
    this.updateChain = Promise.resolve();
    this.started = false;
  }

  async ensureStarted() {
    if (this.started) {
      return;
    }
    this.started = true;
    try {
      const response = await this.adapter.reply(this.sourceMessageId, STREAM_PLACEHOLDER);
      this.replyMessageId = response?.data?.message_id || null;
    } catch (error) {
      console.error('[Feishu] Failed to create stream reply:', error);
    }
    console.log('[Feishu] Stream reply started:', {
      sourceMessageId: this.sourceMessageId,
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
          console.error('[Feishu] Stream flush failed:', error);
        });
      }, STREAM_UPDATE_INTERVAL_MS);
    }
  }

  async flush(final) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const baseText = this.pendingText.trim() || STREAM_PLACEHOLDER;
    const nextText = final ? baseText : `${baseText}${STREAM_IN_PROGRESS_SUFFIX}`;

    if (!final && nextText === this.lastRenderedText) {
      return;
    }

    this.updateChain = this.updateChain
      .then(async () => {
        await this.ensureStarted();

        if (this.replyMessageId) {
          await this.adapter.updateMessage(this.replyMessageId, nextText);
          this.lastRenderedText = nextText;
          return;
        }

        if (!final) {
          return;
        }
        console.warn('[Feishu] No reply message for finalize, sending new reply');
        const response = await this.adapter.reply(this.sourceMessageId, nextText);
        this.replyMessageId = response?.data?.message_id || null;
        this.lastRenderedText = nextText;
      })
      .catch((error) => {
        console.error('[Feishu] Stream update failed:', {
          final,
          sourceMessageId: this.sourceMessageId,
          replyMessageId: this.replyMessageId,
          error: error.message || error
        });
      });

    return this.updateChain;
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

export class FeishuAdapter extends ChannelAdapter {
  constructor({ appId, appSecret }) {
    super('feishu');
    this.appId = appId;
    this.appSecret = appSecret;
    this.client = new Client({ appId, appSecret });
  }

  async start() {
    const eventDispatcher = new EventDispatcher({}).register({
      'im.message.receive_v1': async (data) => {
        console.log('[Feishu] Message received:', JSON.stringify(data, null, 2));
        const { message, sender } = data;

        const msgData = {
          userKey: sender.sender_id.open_id || sender.sender_id.user_id,
          conversationKey: message.chat_id,
          messageKey: message.message_id,
          messageType: message.message_type,
          text: '',
          attachments: [],
          raw: data
        };

        if (message.message_type === 'text') {
          msgData.text = JSON.parse(message.content).text;
        } else if (message.message_type === 'image') {
          const imageKey = JSON.parse(message.content).image_key;
          msgData.text = '[图片]';
          msgData.attachments.push({ type: 'image', imageKey });
        } else if (message.message_type === 'audio') {
          const fileKey = JSON.parse(message.content).file_key;
          msgData.text = '[语音]';
          msgData.attachments.push({ type: 'audio', fileKey });
        }

        this.emitMessage(msgData);
      }
    });

    // 监听所有事件
    eventDispatcher.register({
      '*': (data) => {
        console.log('[Feishu] Event received:', data.header?.event_type);
      }
    });

    const wsClient = new WSClient({
      appId: this.appId,
      appSecret: this.appSecret
    });

    console.log('[Feishu] Starting WebSocket client...');
    console.log('[Feishu] App ID:', this.appId);
    wsClient.start({ eventDispatcher });
  }

  async acknowledge(message) {
    await this.addReaction(message.replyRef.messageKey);
  }

  async resolvePromptInput(message) {
    const promptOptions = {};
    let promptText = message.text || '';
    const images = message.attachments.filter((attachment) => attachment.type === 'image');
    const audios = message.attachments.filter((attachment) => attachment.type === 'audio');

    if (images.length > 0) {
      promptOptions.images = [];
      for (const image of images) {
        const base64 = await this.getImageBase64(image.imageKey);
        promptOptions.images.push({ mimeType: 'image/png', data: base64 });
      }
      promptText += '\n\n用户附带了图片，请结合图片内容回答。';
    }

    if (audios.length > 0) {
      const transcription = await this.transcribeAudio(audios[0].fileKey);
      promptText = transcription;
    }

    return { promptText, promptOptions };
  }

  createStreamHandle(message) {
    return new FeishuStreamHandle(this, message.replyRef.messageKey);
  }

  async reply(messageId, content, options = {}) {
    const response = await this.client.im.message.reply({
      path: { message_id: messageId },
      data: this.buildMessagePayload(content, options)
    });
    console.log('[Feishu] Replied to message:', messageId, 'response:', response.data);
    return response;
  }

  async sendMessage(userId, content, options = {}) {
    const normalizedTarget = typeof userId === 'object' ? userId.userKey : userId;
    const response = await this.client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: normalizedTarget,
        ...this.buildMessagePayload(content, options)
      }
    });
    console.log('[Feishu] Sent message to user:', normalizedTarget, 'response:', response.data);
    return response;
  }

  async sendText(target, text, options = {}) {
    return this.sendMessage(target, text, options);
  }

  async replyText(message, text, options = {}) {
    return this.reply(message.replyRef.messageKey, text, options);
  }

  async updateMessage(messageId, content, options = {}) {
    const response = await this.client.im.message.update({
      path: { message_id: messageId },
      data: this.buildMessagePayload(content, options)
    });
    console.log('[Feishu] Updated message:', messageId, 'response:', response.data);
    return response;
  }

  async addReaction(messageId, emojiType = 'SMILE') {
    const response = await this.client.im.messageReaction.create({
      path: { message_id: messageId },
      data: {
        reaction_type: {
          emoji_type: emojiType
        }
      }
    });
    console.log('[Feishu] Added reaction:', {
      messageId,
      emojiType,
      response: response.data
    });
    return response;
  }

  async getImageBase64(imageKey) {
    const res = await this.client.im.image.get({
      path: { image_key: imageKey }
    });
    return res.data.toString('base64');
  }

  async getAudioBase64(fileKey) {
    const res = await this.client.im.file.get({
      path: { file_key: fileKey }
    });
    return res.data.toString('base64');
  }

  async transcribeAudio(fileKey) {
    try {
      const res = await this.client.speech_to_text.speech.fileRecognize({
        data: {
          speech: { speech: fileKey },
          config: { file_id: fileKey, format: 'opus', engine_type: 'model_16k' }
        }
      });
      return res.data?.recognition_text || '[语音识别失败]';
    } catch (err) {
      console.error('[Feishu] Audio transcribe error:', err);
      return '[语音]';
    }
  }

  async sendFile(targetOrUser, filePath, fileName) {
    const userId = typeof targetOrUser === 'object' ? targetOrUser.userKey : targetOrUser;
    const fs = await import('fs');

    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const fileStream = fs.createReadStream(filePath);
    const res = await this.client.im.file.create({
      data: {
        file_type: 'stream',
        file_name: fileName || filePath.split('/').pop(),
        file: fileStream
      }
    });

    const fileKey = res?.data?.file_key;
    if (!fileKey) {
      console.error('[Feishu] File upload returned no file_key:', { filePath, response: res });
      throw new Error(`文件上传失败，飞书未返回 file_key: ${filePath}`);
    }

    await this.client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: userId,
        msg_type: 'file',
        content: JSON.stringify({ file_key: fileKey })
      }
    });
  }

  buildMessagePayload(content) {
    return {
      content: JSON.stringify({
        zh_cn: {
          title: '',
          content: [[{ tag: 'text', text: content }]]
        }
      }),
      msg_type: 'post'
    };
  }
}
