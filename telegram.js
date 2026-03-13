import 'dotenv/config';
import { resolve } from 'path';
import { BridgeController } from './src/bridge-controller.js';
import { TelegramAdapter } from './src/adapters/telegram.js';
import { CursorSessionManager } from './src/cursor-session-manager.js';
import { TaskScheduler } from './src/task-scheduler.js';
import { ElevenLabsClient } from './src/elevenlabs.js';

const projectDir = resolve(process.env.CURSOR_PROJECT_DIR || process.argv[2] || process.cwd());

const elevenLabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
  voiceId: process.env.ELEVENLABS_VOICE_ID
});

const telegram = new TelegramAdapter({
  token: process.env.TELEGRAM_BOT_TOKEN,
  allowedUsers: process.env.TELEGRAM_ALLOWED_USERS,
  allowedChats: process.env.TELEGRAM_ALLOWED_CHATS,
  elevenLabs
});

const cursorSessions = new CursorSessionManager({
  cwd: projectDir,
  model: process.env.CURSOR_MODEL || null
});
const scheduler = new TaskScheduler();
const controller = new BridgeController({
  channelAdapter: telegram,
  cursorSessions,
  scheduler,
  elevenLabs
});

controller.attach();

await telegram.start();
console.log(`Telegram ↔ Cursor Bridge started! (project: ${projectDir})`);
await controller.sendStartupGreeting();
