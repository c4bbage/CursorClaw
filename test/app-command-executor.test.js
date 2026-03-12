import assert from 'node:assert';
import { describe, it } from 'node:test';
import { AppCommandExecutor } from '../src/app-command-executor.js';

describe('AppCommandExecutor', () => {
  it('sends files through the active channel target', async () => {
    const sentFiles = [];
    const executor = new AppCommandExecutor({
      scheduler: {
        schedule() {},
        list() {
          return [];
        },
        cancel() {
          return false;
        }
      },
      cursorSessions: {
        async prompt() {
          return { text: 'scheduled reply' };
        }
      },
      channelAdapter: {
        async sendText() {},
        async sendFile(target, filePath, fileName) {
          sentFiles.push({ target, filePath, fileName });
        }
      }
    });

    const context = {
      scopeKey: 'telegram:chat-1:user-1',
      target: {
        channel: 'telegram',
        conversationKey: 'chat-1',
        userKey: 'user-1'
      }
    };

    const messages = await executor.execute([
      { type: 'send_file', filePath: '/tmp/report.txt', fileName: 'report.txt' }
    ], context);

    assert.deepStrictEqual(sentFiles, [
      {
        target: context.target,
        filePath: '/tmp/report.txt',
        fileName: 'report.txt'
      }
    ]);
    assert.deepStrictEqual(messages, ['已发送文件：report.txt']);
  });

  it('prefixes scheduled task ids with the scope key', async () => {
    const scheduled = [];
    const cancellations = [];
    const scheduler = {
      schedule(taskId, cronExpression) {
        scheduled.push({ taskId, cronExpression });
      },
      list() {
        return ['telegram:chat-1:user-1:daily', 'feishu:chat-2:user-2:nightly'];
      },
      cancel(taskId) {
        cancellations.push(taskId);
        return taskId === 'telegram:chat-1:user-1:daily';
      }
    };
    const executor = new AppCommandExecutor({
      scheduler,
      cursorSessions: {
        async prompt() {
          return { text: 'scheduled reply' };
        }
      },
      channelAdapter: {
        async sendText() {},
        async sendFile() {}
      }
    });
    const context = {
      scopeKey: 'telegram:chat-1:user-1',
      target: {
        channel: 'telegram',
        conversationKey: 'chat-1',
        userKey: 'user-1'
      }
    };

    const createMessages = await executor.execute([
      { type: 'schedule_task', taskId: 'daily', cron: '0 8 * * *', prompt: 'ping' }
    ], context);
    const listMessages = await executor.execute([{ type: 'list_tasks' }], context);
    const cancelMessages = await executor.execute([{ type: 'cancel_task', taskId: 'daily' }], context);

    assert.deepStrictEqual(scheduled, [
      { taskId: 'telegram:chat-1:user-1:daily', cronExpression: '0 8 * * *' }
    ]);
    assert.deepStrictEqual(cancellations, ['telegram:chat-1:user-1:daily']);
    assert.deepStrictEqual(createMessages, ['已创建定时任务：daily (0 8 * * *)']);
    assert.deepStrictEqual(listMessages, ['当前任务：\ndaily']);
    assert.deepStrictEqual(cancelMessages, ['已取消任务：daily']);
  });
});
