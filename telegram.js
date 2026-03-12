import 'dotenv/config';
import { BridgeController } from './src/bridge-controller.js';
import { TelegramAdapter } from './src/adapters/telegram.js';
import { CursorSessionManager } from './src/cursor-session-manager.js';
import { TaskScheduler } from './src/task-scheduler.js';

const telegram = new TelegramAdapter({
  token: process.env.TELEGRAM_BOT_TOKEN
});

const cursorSessions = new CursorSessionManager({
  cwd: process.cwd()
});
const scheduler = new TaskScheduler();
const controller = new BridgeController({
  channelAdapter: telegram,
  cursorSessions,
  scheduler
});

controller.attach();

await telegram.start();
console.log('Telegram ↔ Cursor Bridge started!');
