import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import readline from 'readline';
import { APP_COMMANDS_INSTRUCTIONS } from './app-commands.js';

const DEFAULT_PROMPT_TIMEOUT_MS = 5 * 60 * 1000;

export class CursorBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.cwd = options.cwd || process.cwd();
    this.mcpServers = options.mcpServers;
    this.clientInfo = options.clientInfo || { name: 'feishu-cursor-bridge', version: '0.1.0' };
    this.promptTimeoutMs = options.promptTimeoutMs || DEFAULT_PROMPT_TIMEOUT_MS;
    this.process = null;
    this.nextId = 1;
    this.pending = new Map();
    this.sessionId = null;
    this.promptQueue = Promise.resolve();
    this.activePrompt = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.process = spawn('agent', ['acp'], {
        stdio: ['pipe', 'pipe', 'inherit']
      });

      const rl = readline.createInterface({ input: this.process.stdout });
      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line);
          this.handleMessage(msg);
        } catch (e) {
          console.error('[ACP] Parse error:', e);
        }
      });

      this.process.on('error', (error) => {
        console.error('[Cursor] Failed to start ACP process:', error);
        reject(error);
      });

      this.process.on('close', (code) => {
        console.log('[Cursor] Process exited:', code);
        this.emit('close', { code, sessionId: this.sessionId });
      });

      this.initialize().then(resolve).catch(reject);
    });
  }

  async initialize() {
    await this.send('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false
      },
      clientInfo: this.clientInfo
    });

    await this.send('authenticate', { methodId: 'cursor_login' });
    const { sessionId } = await this.send('session/new', this.buildSessionParams());
    this.sessionId = sessionId;
    console.log('[Cursor] Session ready:', sessionId);
  }

  handleMessage(msg) {
    const isResponse = msg.id != null && !msg.method;
    if (isResponse) {
      const waiter = this.pending.get(msg.id);
      if (waiter) {
        this.pending.delete(msg.id);
        msg.error ? waiter.reject(msg.error) : waiter.resolve(msg.result);
      } else {
        console.warn('[Cursor] Unmatched response id=', msg.id);
      }
      return;
    }

    if (msg.method === 'session/update') {
      const update = msg.params?.update;
      const updateType = update?.sessionUpdate;

      if (updateType === 'agent_message_chunk' && update.content?.text) {
        if (this.activePrompt?.onChunk) {
          this.activePrompt.onChunk(update.content.text);
        }
        this.emit('chunk', update.content.text);
      } else if (updateType === 'tool_call') {
        const toolName = update.toolName || update.tool?.name || '';
        console.log('[Cursor] Tool call:', toolName);
        if (this.activePrompt?.onToolStatus) {
          this.activePrompt.onToolStatus(toolName);
        }
        this.emit('tool_status', { type: 'tool_call', toolName });
      } else if (updateType === 'tool_call_update') {
        // silently consume intermediate tool progress
      } else {
        console.log('[Cursor] Session update:', updateType || 'unknown');
      }
      return;
    }

    if (msg.method === 'session/request_permission') {
      console.log('[Cursor] Permission request: id=', msg.id, 'tool=', msg.params?.toolName || msg.params?.permissions?.[0]?.tool || 'unknown');
      this.respond(msg.id, {
        outcome: { outcome: 'selected', optionId: 'allow-once' }
      });
      return;
    }

    const isCursorEvent = msg.method?.startsWith('cursor/') || msg.method?.startsWith('_cursor/');
    if (isCursorEvent) {
      const normalizedMethod = msg.method.replace(/^_cursor\//, 'cursor/');
      console.log('[Cursor] Extension event:', msg.method, '→', normalizedMethod, 'id=', msg.id);
      this.emit('cursor_event', { ...msg, method: normalizedMethod });
      return;
    }

    if (msg.id && msg.method) {
      console.warn('[Cursor] Unhandled request, auto-acknowledging:', msg.method, 'id=', msg.id);
      this.respond(msg.id, { acknowledged: true });
      return;
    }

    console.log('[Cursor] Ignored message:', JSON.stringify(msg));
  }

  send(method, params) {
    const id = this.nextId++;
    console.log('[Cursor] Sending ACP request:', method, 'id=', id);
    this.process.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    );
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  respond(id, result) {
    this.process.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'
    );
  }

  async prompt(message, options = {}) {
    const runPrompt = async () => {
      if (message.trim() === '/new') {
        const { sessionId } = await this.send('session/new', this.buildSessionParams());
        this.sessionId = sessionId;
        return { text: '✓ 新会话已创建', stopReason: 'new_session' };
      }

      const systemPrompt = `${APP_COMMANDS_INSTRUCTIONS}

用户消息：
${message}`;

      let fullResponse = '';
      let chunkCount = 0;

      this.activePrompt = {
        onChunk: (text) => {
          chunkCount += 1;
          fullResponse += text;
          options.onChunk?.(text);
        },
        onToolStatus: options.onToolStatus || null
      };

      const content = [{ type: 'text', text: systemPrompt }];

      if (options.images && options.images.length > 0) {
        for (const img of options.images) {
          content.push({
            type: 'image',
            mimeType: img.mimeType,
            data: img.data
          });
        }
      }

      console.log('[Cursor] Prompt start:', {
        sessionId: this.sessionId,
        messageLength: message.length,
        imageCount: options.images?.length || 0
      });

      try {
        const promptPromise = this.send('session/prompt', {
          sessionId: this.sessionId,
          prompt: content
        });

        const timeoutMs = options.timeoutMs || this.promptTimeoutMs;
        const result = await Promise.race([
          promptPromise,
          new Promise((_, reject) => {
            const timer = setTimeout(() => {
              reject(new Error(`Prompt timed out after ${Math.round(timeoutMs / 1000)}s`));
            }, timeoutMs);
            promptPromise.then(() => clearTimeout(timer), () => clearTimeout(timer));
          })
        ]);

        const text = fullResponse || this.extractTextFromResult(result);
        console.log('[Cursor] Prompt complete:', {
          sessionId: this.sessionId,
          stopReason: result?.stopReason || 'unknown',
          chunkCount,
          responseLength: text.length
        });
        this.emit('response', text);
        return {
          text,
          stopReason: result?.stopReason || 'unknown'
        };
      } catch (error) {
        if (error.message?.includes('timed out') && fullResponse) {
          console.warn('[Cursor] Prompt timed out but has partial response:', {
            sessionId: this.sessionId,
            chunkCount,
            responseLength: fullResponse.length
          });
          this.cancelCurrentPrompt();
          return { text: fullResponse, stopReason: 'timeout' };
        }
        throw error;
      } finally {
        this.activePrompt = null;
      }
    };

    const queuedPrompt = this.promptQueue.then(runPrompt, runPrompt);
    this.promptQueue = queuedPrompt.then(() => undefined, () => undefined);
    return queuedPrompt;
  }

  extractTextFromResult(result) {
    if (!result) {
      return '';
    }

    if (Array.isArray(result.output)) {
      return result.output
        .filter((part) => part?.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('');
    }

    if (typeof result.text === 'string') {
      return result.text;
    }

    return '';
  }

  buildSessionParams() {
    const params = {
      cwd: this.cwd,
      mcpServers: Array.isArray(this.mcpServers) ? this.mcpServers : []
    };

    return params;
  }

  cancelCurrentPrompt() {
    if (!this.sessionId) {
      return;
    }
    console.log('[Cursor] Sending session/cancel for session:', this.sessionId);
    this.process.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'session/cancel',
        params: { sessionId: this.sessionId }
      }) + '\n'
    );
  }

  stop() {
    if (this.process) {
      this.process.stdin.end();
      this.process.kill();
    }
  }
}
