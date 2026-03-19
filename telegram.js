import 'dotenv/config';
import { resolve, join } from 'path';
import { BridgeController } from './src/bridge-controller.js';
import { TelegramAdapter } from './src/adapters/telegram.js';
import { CursorSessionManager } from './src/cursor-session-manager.js';
import { TaskScheduler } from './src/task-scheduler.js';
import { ElevenLabsClient } from './src/elevenlabs.js';

const projectDir = resolve(process.env.CURSOR_PROJECT_DIR || process.argv[2] || process.cwd());
const stateDir = join(projectDir, '.cursorclaw_state');

const elevenLabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
  voiceId: process.env.ELEVENLABS_VOICE_ID
});

const telegram = new TelegramAdapter({
  token: process.env.TELEGRAM_BOT_TOKEN,
  allowedUsers: process.env.TELEGRAM_ALLOWED_USERS,
  allowedChats: process.env.TELEGRAM_ALLOWED_CHATS,
  elevenLabs,
  workspaceDir: projectDir
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
  elevenLabs,
  stateDir
});

controller.attach();
await telegram.start();
await controller.restoreState();
console.log(`Telegram ↔ Cursor Bridge started! (project: ${projectDir})`);
await controller.sendStartupGreeting();

async function gracefulShutdown(signal) {
  console.log(`[Shutdown] ${signal} received, saving state...`);
  try {
    controller.saveState();
  } catch (err) {
    console.error('[Shutdown] Failed to save state:', err.message);
  }
  try {
    await cursorSessions.stopAll();
  } catch (err) {
    console.error('[Shutdown] Failed to stop sessions:', err.message);
  }
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
