import { parseAppResponse } from './app-commands.js';

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

export class AppCommandExecutor {
  constructor({ scheduler, cursorSessions, channelAdapter }) {
    this.scheduler = scheduler;
    this.cursorSessions = cursorSessions;
    this.channelAdapter = channelAdapter;
  }

  async execute(commands, context) {
    const messages = [];

    for (const command of commands) {
      console.log('[Bridge] Executing app command:', {
        scopeKey: context.scopeKey,
        command
      });

      if (command.type === 'schedule_task') {
        this.scheduler.schedule(`${context.scopeKey}:${command.taskId}`, command.cron, async () => {
          const scheduledResult = await this.cursorSessions.prompt(context.scopeKey, command.prompt);
          const scheduledParsed = parseAppResponse(scheduledResult.text);
          const scheduledCommandMessages = await this.execute(scheduledParsed.commands, context);
          const outboundText = composeFinalText(
            scheduledParsed.visibleText,
            scheduledParsed.parseError,
            scheduledCommandMessages
          );
          await this.channelAdapter.sendText(context.target, outboundText);
        });
        messages.push(`已创建定时任务：${command.taskId} (${command.cron})`);
        continue;
      }

      if (command.type === 'list_tasks') {
        const taskPrefix = `${context.scopeKey}:`;
        const tasks = this.scheduler.list()
          .filter((taskId) => taskId.startsWith(taskPrefix))
          .map((taskId) => taskId.slice(taskPrefix.length));
        messages.push(tasks.length > 0 ? `当前任务：\n${tasks.join('\n')}` : '当前没有任务。');
        continue;
      }

      if (command.type === 'cancel_task') {
        const taskId = `${context.scopeKey}:${command.taskId}`;
        const success = this.scheduler.cancel(taskId);
        messages.push(success ? `已取消任务：${command.taskId}` : `任务不存在：${command.taskId}`);
        continue;
      }

      if (command.type === 'send_file') {
        await this.channelAdapter.sendFile(context.target, command.filePath, command.fileName);
        messages.push(`已发送文件：${command.fileName || command.filePath}`);
      }
    }

    return messages;
  }
}

export { composeFinalText };
