import 'dotenv/config';
import { resolve } from 'path';
import { FeishuAdapter } from './src/adapters/feishu.js';
import { BridgeController } from './src/bridge-controller.js';
import { CursorSessionManager } from './src/cursor-session-manager.js';
import { TaskScheduler } from './src/task-scheduler.js';
import { ElevenLabsClient } from './src/elevenlabs.js';

const projectDir = resolve(process.env.CURSOR_PROJECT_DIR || process.argv[2] || process.cwd());

const elevenLabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
  voiceId: process.env.ELEVENLABS_VOICE_ID
});

const feishu = new FeishuAdapter({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  allowedUsers: process.env.FEISHU_ALLOWED_USERS,
  allowedChats: process.env.FEISHU_ALLOWED_CHATS,
  elevenLabs
});

const cursorSessions = new CursorSessionManager({
  cwd: projectDir,
  model: process.env.CURSOR_MODEL || null
});
const scheduler = new TaskScheduler();
const controller = new BridgeController({
  channelAdapter: feishu,
  cursorSessions,
  scheduler,
  elevenLabs
});

controller.attach();

await feishu.start();
console.log(`Feishu ↔ Cursor Bridge started! (project: ${projectDir})`);
await controller.sendStartupGreeting();
