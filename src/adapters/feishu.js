import { Client, WSClient, EventDispatcher } from '@larksuiteoapi/node-sdk';
import { EventEmitter } from 'events';

export class FeishuAdapter extends EventEmitter {
  constructor({ appId, appSecret }) {
    super();
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
          userId: sender.sender_id.open_id || sender.sender_id.user_id,
          messageId: message.message_id,
          messageType: message.message_type,
          content: '',
          images: [],
          audio: null
        };

        // 处理不同类型消息
        if (message.message_type === 'text') {
          msgData.content = JSON.parse(message.content).text;
        } else if (message.message_type === 'image') {
          const imageKey = JSON.parse(message.content).image_key;
          msgData.content = '[图片]';
          msgData.images.push({ imageKey });
        } else if (message.message_type === 'audio') {
          const fileKey = JSON.parse(message.content).file_key;
          msgData.content = '[语音]';
          msgData.audio = { fileKey };
        }

        this.emit('message', msgData);
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

  async reply(messageId, content, options = {}) {
    const response = await this.client.im.message.reply({
      path: { message_id: messageId },
      data: this.buildMessagePayload(content, options)
    });
    console.log('[Feishu] Replied to message:', messageId, 'response:', response.data);
    return response;
  }

  async sendMessage(userId, content, options = {}) {
    const response = await this.client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: userId,
        ...this.buildMessagePayload(content, options)
      }
    });
    console.log('[Feishu] Sent message to user:', userId, 'response:', response.data);
    return response;
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

  async sendFile(userId, filePath, fileName) {
    const fs = await import('fs');
    const fileStream = fs.createReadStream(filePath);

    const res = await this.client.im.file.create({
      data: {
        file_type: 'stream',
        file_name: fileName || filePath.split('/').pop(),
        file: fileStream
      }
    });

    await this.client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: userId,
        msg_type: 'file',
        content: JSON.stringify({ file_key: res.data.file_key })
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
