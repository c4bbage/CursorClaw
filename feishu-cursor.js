import 'dotenv/config';
import { existsSync } from 'fs';
import { FeishuAdapter } from './src/adapters/feishu.js';
import { AppResponseAccumulator, parseAppResponse } from './src/app-commands.js';
import {
  buildAskQuestionResponse,
  buildCreatePlanResponse,
  extractGeneratedImagePaths,
  formatAskQuestionMessage,
  formatCreatePlanMessage,
  formatGenerateImageMessage,
  formatTaskMessage,
  formatTodosMessage
} from './src/cursor-events.js';
import { CursorSessionManager } from './src/cursor-session-manager.js';
import { TaskScheduler } from './src/task-scheduler.js';

const feishu = new FeishuAdapter({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET
});

const cursorSessions = new CursorSessionManager({
  cwd: process.cwd()
});
const scheduler = new TaskScheduler();
const STREAM_UPDATE_INTERVAL_MS = 1200;
const STREAM_MIN_DELTA_CHARS = 24;
const STREAM_PLACEHOLDER = '正在思考...';
const STREAM_IN_PROGRESS_SUFFIX = '\n\n[生成中...]';
const pendingInteractions = new Map();

class FeishuStreamingReply {
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

  async start() {
    if (this.started) {
      return;
    }

    this.started = true;
    const response = await this.adapter.reply(this.sourceMessageId, STREAM_PLACEHOLDER);
    this.replyMessageId = response?.data?.message_id || null;
    console.log('[Bridge] Stream reply started:', {
      sourceMessageId: this.sourceMessageId,
      replyMessageId: this.replyMessageId
    });
  }

  queue(text) {
    this.pendingText = text;

    if (!this.started) {
      this.updateChain = this.updateChain.then(() => this.start());
    }

    const delta = Math.abs(this.pendingText.length - this.lastRenderedText.length);
    if (delta < STREAM_MIN_DELTA_CHARS && this.timer) {
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush(false).catch((error) => {
          console.error('[Bridge] Stream flush failed:', error);
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

    this.updateChain = this.updateChain.then(async () => {
      if (!this.started) {
        await this.start();
      }

      if (!this.replyMessageId) {
        console.warn('[Bridge] Missing reply message id, skip stream update');
        return;
      }

      await this.adapter.updateMessage(this.replyMessageId, nextText);
      this.lastRenderedText = nextText;
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

function composeFinalText(visibleText, parseError, commandMessages) {
  const sections = [];

  if (visibleText && visibleText.trim()) {
    sections.push(visibleText.trim());
  }

  if (parseError) {
    sections.push('注意：应用命令解析失败，相关动作未执行。');
  }

  if (commandMessages.length > 0) {
    sections.push(commandMessages.join('\n'));
  }

  return sections.join('\n\n').trim() || '已处理。';
}

async function buildPromptPayload(msg) {
  const options = {};
  let promptText = msg.content;

  if (msg.images && msg.images.length > 0) {
    options.images = [];
    for (const img of msg.images) {
      const base64 = await feishu.getImageBase64(img.imageKey);
      options.images.push({ mimeType: 'image/png', data: base64 });
    }
    promptText += '\n\n用户附带了图片，请结合图片内容回答。';
  }

  if (msg.audio) {
    const transcription = await feishu.transcribeAudio(msg.audio.fileKey);
    promptText = transcription;
  }

  return { promptText, options };
}

async function resolveIncomingText(msg) {
  if (msg.audio) {
    return feishu.transcribeAudio(msg.audio.fileKey);
  }

  if (typeof msg.content === 'string') {
    return msg.content.trim();
  }

  return '';
}

async function executeAppCommands(commands, userId) {
  const messages = [];

  for (const command of commands) {
    console.log('[Bridge] Executing app command:', { userId, command });

    if (command.type === 'schedule_task') {
      scheduler.schedule(command.taskId, command.cron, async () => {
        const scheduledResult = await cursorSessions.prompt(userId, command.prompt);
        const scheduledParsed = parseAppResponse(scheduledResult.text);
        const scheduledCommandMessages = await executeAppCommands(scheduledParsed.commands, userId);
        const outboundText = composeFinalText(
          scheduledParsed.visibleText,
          scheduledParsed.parseError,
          scheduledCommandMessages
        );
        await feishu.sendMessage(userId, outboundText);
      });
      messages.push(`已创建定时任务：${command.taskId} (${command.cron})`);
      continue;
    }

    if (command.type === 'list_tasks') {
      const tasks = scheduler.list();
      messages.push(tasks.length > 0 ? `当前任务：\n${tasks.join('\n')}` : '当前没有任务。');
      continue;
    }

    if (command.type === 'cancel_task') {
      const success = scheduler.cancel(command.taskId);
      messages.push(success ? `已取消任务：${command.taskId}` : `任务不存在：${command.taskId}`);
      continue;
    }

    if (command.type === 'send_file') {
      await feishu.sendFile(userId, command.filePath, command.fileName);
      messages.push(`已发送文件：${command.fileName || command.filePath}`);
    }
  }

  return messages;
}

async function handlePendingInteraction(msg) {
  const interaction = pendingInteractions.get(msg.userId);
  if (!interaction) {
    return false;
  }

  const text = await resolveIncomingText(msg);
  if (!text) {
    await feishu.reply(msg.messageId, '请用文本回复这个交互请求。');
    return true;
  }

  try {
    let response;
    if (interaction.method === 'cursor/ask_question') {
      response = buildAskQuestionResponse(interaction.params, text);
    } else if (interaction.method === 'cursor/create_plan') {
      response = buildCreatePlanResponse(text);
    } else {
      throw new Error(`Unsupported pending interaction: ${interaction.method}`);
    }

    cursorSessions.respond(msg.userId, interaction.id, response.result);
    pendingInteractions.delete(msg.userId);
    await feishu.reply(msg.messageId, `已提交给 Cursor：${response.summary}`);
    console.log('[Bridge] Interaction response sent:', {
      method: interaction.method,
      userId: msg.userId,
      summary: response.summary
    });
  } catch (error) {
    console.error('[Bridge] Interaction response failed:', error);
    await feishu.reply(msg.messageId, error.message);
  }

  return true;
}

function acknowledgeCursorEvent(userId, event, result = { acknowledged: true }) {
  if (event.id) {
    cursorSessions.respond(userId, event.id, result);
  }
}

async function handleCursorEvent({ userId, event }) {
  console.log('[Bridge] Cursor event received:', {
    userId,
    method: event.method,
    id: event.id,
    params: event.params
  });

  if (event.method === 'cursor/ask_question') {
    pendingInteractions.set(userId, {
      id: event.id,
      method: event.method,
      params: event.params
    });
    await feishu.sendMessage(userId, formatAskQuestionMessage(event.params));
    return;
  }

  if (event.method === 'cursor/create_plan') {
    pendingInteractions.set(userId, {
      id: event.id,
      method: event.method,
      params: event.params
    });
    await feishu.sendMessage(userId, formatCreatePlanMessage(event.params));
    return;
  }

  if (event.method === 'cursor/update_todos') {
    await feishu.sendMessage(userId, formatTodosMessage(event.params));
    acknowledgeCursorEvent(userId, event);
    return;
  }

  if (event.method === 'cursor/task') {
    await feishu.sendMessage(userId, formatTaskMessage(event.params));
    acknowledgeCursorEvent(userId, event);
    return;
  }

  if (event.method === 'cursor/generate_image') {
    await feishu.sendMessage(userId, formatGenerateImageMessage(event.params));

    for (const imagePath of extractGeneratedImagePaths(event.params)) {
      if (existsSync(imagePath)) {
        await feishu.sendFile(userId, imagePath, imagePath.split('/').pop());
      } else {
        console.warn('[Bridge] Generated image path not found:', { userId, imagePath });
      }
    }

    acknowledgeCursorEvent(userId, event);
    return;
  }

  acknowledgeCursorEvent(userId, event);
}

async function handleMessage(msg) {
  console.log('[Bridge] Feishu →', msg.content, 'Type:', msg.messageType, 'Message ID:', msg.messageId, 'User:', msg.userId);

  feishu.addReaction(msg.messageId).catch((error) => {
    console.error('[Bridge] Failed to add received reaction:', {
      messageId: msg.messageId,
      userId: msg.userId,
      error
    });
  });

  if (await handlePendingInteraction(msg)) {
    return;
  }

  const stream = new FeishuStreamingReply(feishu, msg.messageId);
  const accumulator = new AppResponseAccumulator();

  try {
    const { promptText, options } = await buildPromptPayload(msg);
    const result = await cursorSessions.prompt(msg.userId, promptText, {
      ...options,
      onChunk: (text) => {
        accumulator.append(text);
        process.stdout.write(text);
        stream.queue(accumulator.getStreamingText());
      }
    });

    if (!accumulator.rawText && result.text) {
      accumulator.append(result.text);
    }

    const parsed = accumulator.finalize();
    if (parsed.parseError) {
      console.error('[Bridge] app-commands parse error:', {
        userId: msg.userId,
        error: parsed.parseError,
        rawText: accumulator.rawText
      });
    }

    const commandMessages = await executeAppCommands(parsed.commands, msg.userId);
    const finalText = composeFinalText(parsed.visibleText, parsed.parseError, commandMessages);
    await stream.finalize(finalText);
  } catch (err) {
    console.error('[Bridge] Error:', { userId: msg.userId, error: err });
    await stream.fail('处理失败: ' + err.message);
  }
}

feishu.on('message', (msg) => {
  handleMessage(msg).catch((error) => {
    console.error('[Bridge] Unhandled message error:', error);
  });
});

cursorSessions.on('cursor_event', (event) => {
  handleCursorEvent(event).catch((error) => {
    console.error('[Bridge] Cursor event handling failed:', error);
  });
});

cursorSessions.on('session_closed', (info) => {
  console.log('[Bridge] ACP session closed:', info);
});

await feishu.start();

console.log('Feishu ↔ Cursor Bridge started!');
