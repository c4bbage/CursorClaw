import { existsSync } from 'fs';
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

export class BridgeController {
  constructor({ channelAdapter, cursorSessions, scheduler }) {
    this.channelAdapter = channelAdapter;
    this.cursorSessions = cursorSessions;
    this.scheduler = scheduler;
    this.pendingInteractions = new Map();
    this.latestTargets = new Map();
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

    if (message.text?.trim() === '/cancel') {
      const cancelled = this.cursorSessions.cancelPrompt(message.scopeKey);
      const reply = cancelled
        ? '已发送取消请求，当前任务将中断。'
        : '当前没有正在执行的任务。';
      await this.channelAdapter.replyText(message, reply);
      return;
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
}
