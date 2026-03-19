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
    this.taskDefinitions = new Map();
  }

  async execute(commands, context) {
    const messages = [];

    for (const command of commands) {
      console.log('[Bridge] Executing app command:', {
        scopeKey: context.scopeKey,
        command
      });

      if (command.type === 'schedule_task') {
        const fullTaskId = `${context.scopeKey}:${command.taskId}`;
        this.taskDefinitions.set(fullTaskId, {
          taskId: command.taskId,
          cron: command.cron,
          prompt: command.prompt,
          scopeKey: context.scopeKey,
          target: context.target
        });
        this._scheduleTask(fullTaskId, command.cron, command.prompt, context.scopeKey, context.target);
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
        const fullTaskId = `${context.scopeKey}:${command.taskId}`;
        const success = this.scheduler.cancel(fullTaskId);
        if (success) this.taskDefinitions.delete(fullTaskId);
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

  _scheduleTask(fullTaskId, cron, prompt, scopeKey, target) {
    this.scheduler.schedule(fullTaskId, cron, async () => {
      const scheduledResult = await this.cursorSessions.prompt(scopeKey, prompt);
      const scheduledParsed = parseAppResponse(scheduledResult.text);
      const scheduledCommandMessages = await this.execute(scheduledParsed.commands, { scopeKey, target });
      const outboundText = composeFinalText(
        scheduledParsed.visibleText,
        scheduledParsed.parseError,
        scheduledCommandMessages
      );
      await this.channelAdapter.sendText(target, outboundText);
    });
  }

  getTaskDefinitions() {
    return Array.from(this.taskDefinitions.values());
  }

  restoreTasks(tasks) {
    for (const def of tasks) {
      const fullTaskId = `${def.scopeKey}:${def.taskId}`;
      this.taskDefinitions.set(fullTaskId, def);
      this._scheduleTask(fullTaskId, def.cron, def.prompt, def.scopeKey, def.target);
      console.log('[AppCommandExecutor] Restored task:', fullTaskId, def.cron);
    }
  }
}

export { composeFinalText };
