import { existsSync, readFileSync } from 'fs';
import { AppResponseAccumulator } from './app-commands.js';
import { AppCommandExecutor, composeFinalText } from './app-command-executor.js';
import {
  buildAskQuestionResponse,
  buildCreatePlanResponse,
  extractGeneratedImagePaths,
  formatAskQuestionMessage,
  formatCreatePlanMessage,
  formatGenerateImageMessage,
  formatTaskMessage,
  formatTodosMessage
} from './cursor-events.js';

export const BOT_COMMANDS = [
  { command: 'help',   description: '显示可用命令 / Show available commands' },
  { command: 'cancel', description: '取消当前任务 / Cancel current task' },
  { command: 'status', description: '查看会话状态 / Show session status' },
  { command: 'memory', description: '查看项目记忆 / Show project memory' },
  { command: 'clear',  description: '重置会话 / Reset session' },
  { command: 'tasks',  description: '查看定时任务 / List scheduled tasks' },
  { command: 'voice',  description: '切换语音回复 / Toggle voice reply' },
];

export class BridgeController {
  constructor({ channelAdapter, cursorSessions, scheduler, elevenLabs }) {
    this.channelAdapter = channelAdapter;
    this.cursorSessions = cursorSessions;
    this.scheduler = scheduler;
    this.elevenLabs = elevenLabs || null;
    this.pendingInteractions = new Map();
    this.latestTargets = new Map();
    this.voiceMode = new Map();
    this.appCommandExecutor = new AppCommandExecutor({
      scheduler,
      cursorSessions,
      channelAdapter
    });
  }

  attach() {
    this.channelAdapter.on('message', (message) => {
      this.handleMessage(message).catch((error) => {
        console.error('[Bridge] Unhandled message error:', error);
      });
    });

    this.cursorSessions.on('cursor_event', (payload) => {
      this.handleCursorEvent(payload).catch((error) => {
        console.error('[Bridge] Cursor event handling failed:', error);
      });
    });

    this.cursorSessions.on('session_closed', (info) => {
      console.log('[Bridge] ACP session closed:', info);
    });
  }

  async handleMessage(message) {
    console.log('[Bridge] Inbound message:', {
      channel: message.channel,
      scopeKey: message.scopeKey,
      messageKey: message.messageKey,
      text: message.text
    });

    this.latestTargets.set(message.scopeKey, message.target);

    this.channelAdapter.acknowledge(message).catch((error) => {
      console.error('[Bridge] Failed to acknowledge message:', {
        scopeKey: message.scopeKey,
        messageKey: message.messageKey,
        error
      });
    });

    const cmdMatch = message.text?.trim().match(/^\/(\w+)/);
    if (cmdMatch) {
      const handled = await this.handleCommand(cmdMatch[1], message);
      if (handled) return;
    }

    if (await this.handlePendingInteraction(message)) {
      return;
    }

    const stream = this.channelAdapter.createStreamHandle(message);
    const accumulator = new AppResponseAccumulator();
    let lastToolName = '';

    try {
      const { promptText, promptOptions } = await this.channelAdapter.resolvePromptInput(message);
      const result = await this.cursorSessions.prompt(message.scopeKey, promptText, {
        ...promptOptions,
        onChunk: (text) => {
          accumulator.append(text);
          process.stdout.write(text);
          stream.push(accumulator.getStreamingText());
        },
        onToolStatus: (toolName) => {
          if (toolName && toolName !== lastToolName) {
            lastToolName = toolName;
            const visibleSoFar = accumulator.getStreamingText();
            const indicator = `${visibleSoFar}\n\n⚙️ ${toolName}...`;
            stream.push(indicator);
          }
        }
      });

      if (!accumulator.rawText && result.text) {
        accumulator.append(result.text);
      }

      const parsed = accumulator.finalize();
      if (parsed.parseError) {
        console.error('[Bridge] app-commands parse error:', {
          scopeKey: message.scopeKey,
          error: parsed.parseError,
          rawText: accumulator.rawText
        });
      }

      const commandMessages = await this.appCommandExecutor.execute(parsed.commands, {
        scopeKey: message.scopeKey,
        target: message.target
      });
      const finalText = composeFinalText(parsed.visibleText, parsed.parseError, commandMessages);
      await stream.finalize(finalText);

      this._maybeSendVoice(message, finalText);
    } catch (error) {
      console.error('[Bridge] Error:', { scopeKey: message.scopeKey, error });
      await stream.fail('处理失败: ' + error.message);
    }
  }

  async handlePendingInteraction(message) {
    const interaction = this.pendingInteractions.get(message.scopeKey);
    if (!interaction) {
      return false;
    }

    const text = (await this.channelAdapter.resolvePromptInput(message)).promptText;
    if (!text) {
      await this.channelAdapter.replyText(message, '请用文本回复这个交互请求。');
      return true;
    }

    try {
      const response = interaction.method === 'cursor/ask_question'
        ? buildAskQuestionResponse(interaction.params, text)
        : buildCreatePlanResponse(text);

      this.cursorSessions.respond(message.scopeKey, interaction.id, response.result);
      this.pendingInteractions.delete(message.scopeKey);
      await this.channelAdapter.replyText(message, `已提交给 Cursor：${response.summary}`);
      console.log('[Bridge] Interaction response sent:', {
        scopeKey: message.scopeKey,
        method: interaction.method,
        summary: response.summary
      });
    } catch (error) {
      console.error('[Bridge] Interaction response failed:', error);
      await this.channelAdapter.replyText(message, error.message);
    }

    return true;
  }

  acknowledgeCursorEvent(scopeKey, event, result = { acknowledged: true }) {
    if (event.id != null) {
      console.log('[Bridge] Acknowledging cursor event:', { method: event.method, id: event.id });
      this.cursorSessions.respond(scopeKey, event.id, result);
    }
  }

  async handleCursorEvent({ scopeKey, event }) {
    const target = this.latestTargets.get(scopeKey);
    console.log('[Bridge] Cursor event received:', {
      scopeKey,
      method: event.method,
      id: event.id,
      params: event.params
    });

    if (!target) {
      console.warn('[Bridge] Missing delivery target for cursor event:', { scopeKey, method: event.method });
      this.acknowledgeCursorEvent(scopeKey, event);
      return;
    }

    if (event.method === 'cursor/ask_question') {
      this.pendingInteractions.set(scopeKey, {
        id: event.id,
        method: event.method,
        params: event.params
      });
      await this.channelAdapter.sendText(target, formatAskQuestionMessage(event.params));
      return;
    }

    if (event.method === 'cursor/create_plan') {
      this.pendingInteractions.set(scopeKey, {
        id: event.id,
        method: event.method,
        params: event.params
      });
      await this.channelAdapter.sendText(target, formatCreatePlanMessage(event.params));
      return;
    }

    if (event.method === 'cursor/update_todos') {
      await this.channelAdapter.sendText(target, formatTodosMessage(event.params));
      this.acknowledgeCursorEvent(scopeKey, event);
      return;
    }

    if (event.method === 'cursor/task') {
      await this.channelAdapter.sendText(target, formatTaskMessage(event.params));
      this.acknowledgeCursorEvent(scopeKey, event);
      return;
    }

    if (event.method === 'cursor/generate_image') {
      await this.channelAdapter.sendText(target, formatGenerateImageMessage(event.params));
      for (const imagePath of extractGeneratedImagePaths(event.params)) {
        if (existsSync(imagePath)) {
          await this.channelAdapter.sendFile(target, imagePath, imagePath.split('/').pop());
        } else {
          console.warn('[Bridge] Generated image path not found:', { scopeKey, imagePath });
        }
      }
      this.acknowledgeCursorEvent(scopeKey, event);
      return;
    }

    this.acknowledgeCursorEvent(scopeKey, event);
  }

  async handleCommand(cmd, message) {
    switch (cmd) {
      case 'help':
        return this.cmdHelp(message);
      case 'cancel':
        return this.cmdCancel(message);
      case 'status':
        return this.cmdStatus(message);
      case 'memory':
        return this.cmdMemory(message);
      case 'clear':
        return this.cmdClear(message);
      case 'tasks':
        return this.cmdTasks(message);
      case 'voice':
        return this.cmdVoice(message);
      default:
        return false;
    }
  }

  async cmdHelp(message) {
    const lines = ['📋 可用命令 / Available Commands\n'];
    for (const { command, description } of BOT_COMMANDS) {
      lines.push(`/${command} — ${description}`);
    }
    await this.channelAdapter.replyText(message, lines.join('\n'));
    return true;
  }

  async cmdCancel(message) {
    const cancelled = this.cursorSessions.cancelPrompt(message.scopeKey);
    const reply = cancelled
      ? '已发送取消请求，当前任务将中断。'
      : '当前没有正在执行的任务。';
    await this.channelAdapter.replyText(message, reply);
    return true;
  }

  async cmdStatus(message) {
    const session = this.cursorSessions.sessions.get(message.scopeKey);
    if (!session) {
      await this.channelAdapter.replyText(message, '当前没有活跃会话。');
      return true;
    }
    const uptime = Math.round((Date.now() - session.createdAt) / 1000);
    const idle = Math.round((Date.now() - session.lastUsedAt) / 1000);
    const hasPending = this.pendingInteractions.has(message.scopeKey);
    const lines = [
      '📊 Session Status\n',
      `scope: ${message.scopeKey}`,
      `uptime: ${uptime}s`,
      `idle: ${idle}s`,
      `pending interaction: ${hasPending ? 'yes' : 'no'}`,
      `session id: ${session.bridge?.sessionId || 'N/A'}`,
    ];
    await this.channelAdapter.replyText(message, lines.join('\n'));
    return true;
  }

  async cmdMemory(message) {
    const memoryPath = `${process.cwd()}/memory/MEMORY.md`;
    const today = new Date().toISOString().slice(0, 10);
    const dailyPath = `${process.cwd()}/memory/${today}.md`;

    const parts = [];

    if (existsSync(memoryPath)) {
      const content = readFileSync(memoryPath, 'utf-8');
      const preview = content.length > 1500
        ? content.slice(0, 1500) + '\n\n[... 已截断]'
        : content;
      parts.push('📝 Long-Term Memory (MEMORY.md)\n\n' + preview);
    } else {
      parts.push('📝 MEMORY.md 不存在。');
    }

    if (existsSync(dailyPath)) {
      const content = readFileSync(dailyPath, 'utf-8');
      const preview = content.length > 1000
        ? content.slice(-1000)
        : content;
      parts.push(`\n📅 Today (${today})\n\n` + preview);
    }

    await this.channelAdapter.replyText(message, parts.join('\n') || '没有找到记忆文件。');
    return true;
  }

  async cmdClear(message) {
    const destroyed = await this.cursorSessions.destroySession(message.scopeKey);
    this.pendingInteractions.delete(message.scopeKey);
    this.latestTargets.delete(message.scopeKey);
    const reply = destroyed
      ? '会话已重置，下次发消息将创建新会话。'
      : '当前没有活跃会话。';
    await this.channelAdapter.replyText(message, reply);
    return true;
  }

  async cmdTasks(message) {
    const taskList = this.scheduler.list();
    if (taskList.length === 0) {
      await this.channelAdapter.replyText(message, '当前没有定时任务。');
      return true;
    }
    const lines = ['⏰ Scheduled Tasks\n'];
    for (const task of taskList) {
      lines.push(`• ${task.id}: ${task.cron} — ${task.description || 'N/A'}`);
    }
    await this.channelAdapter.replyText(message, lines.join('\n'));
    return true;
  }

  async cmdVoice(message) {
    if (!this.elevenLabs?.enabled) {
      await this.channelAdapter.replyText(message, '⚠️ 语音功能未配置（需要 ELEVENLABS_API_KEY）');
      return true;
    }
    const current = this.voiceMode.get(message.scopeKey) || false;
    this.voiceMode.set(message.scopeKey, !current);
    const status = !current ? '🔊 语音回复已开启' : '🔇 语音回复已关闭';
    await this.channelAdapter.replyText(message, status);
    return true;
  }

  async sendStartupGreeting() {
    const targets = this.channelAdapter.getNotifyTargets();
    if (targets.length === 0) return;

    const cwd = process.cwd().split('/').pop();
    const channel = this.channelAdapter.channelId;
    const voice = this.elevenLabs?.enabled ? '✅' : '❌';
    const hookRunner = this.cursorSessions.hookRunner;
    const hookCount = hookRunner?.hookCount ?? 0;
    const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    const greeting = [
      `🤖 CursorClaw Bridge Online`,
      ``,
      `📂 Project: ${cwd}`,
      `📡 Channel: ${channel}`,
      `🪝 Hooks: ${hookCount} events configured`,
      `🎙️ Voice: ${voice}`,
      `⏰ Time: ${now}`,
      ``,
      `Send a message to start, or /help for commands.`,
      `发送消息开始对话，或 /help 查看命令。`
    ].join('\n');

    for (const target of targets) {
      try {
        await this.channelAdapter.sendText(target, greeting);
        console.log(`[Bridge] Startup greeting sent to ${target.conversationKey}`);
      } catch (err) {
        console.error(`[Bridge] Failed to send startup greeting to ${target.conversationKey}:`, err.message);
      }
    }
  }

  _maybeSendVoice(message, text) {
    if (!this.elevenLabs?.enabled) return;
    if (!this.voiceMode.get(message.scopeKey)) return;
    if (!text || text.length < 5 || text.length > 4000) return;

    const plainText = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/[#*_~\[\]()>|]/g, '')
      .trim();

    if (!plainText || plainText.length < 5) return;

    const ttsText = plainText.length > 2000 ? plainText.slice(0, 2000) + '...' : plainText;

    this.elevenLabs.synthesize(ttsText, { outputFormat: 'mp3_22050_32' })
      .then(({ buffer }) => {
        if (this.channelAdapter.sendAudio) {
          return this.channelAdapter.sendAudio(message.target, buffer);
        }
      })
      .catch((err) => {
        console.error('[Bridge] TTS/send audio failed:', err.message);
      });
  }
}
