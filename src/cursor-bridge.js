import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import readline from 'readline';
import { APP_COMMANDS_INSTRUCTIONS } from './app-commands.js';

const DEFAULT_PROMPT_TIMEOUT_MS = 5 * 60 * 1000;

const SHELL_TOOLS = new Set(['Shell', 'shell']);
const READ_TOOLS = new Set(['Read', 'read', 'Glob', 'Grep', 'SemanticSearch']);
const WRITE_TOOLS = new Set(['Write', 'StrReplace', 'EditNotebook', 'Delete']);

function isMcpTool(name) {
  return name?.startsWith('MCP:') || name?.includes('mcp_') || name?.includes('/');
}

export class CursorBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.cwd = options.cwd || process.cwd();
    this.mcpServers = options.mcpServers;
    this.model = options.model || null;
    this.hookRunner = options.hookRunner || null;
    this.clientInfo = options.clientInfo || { name: 'feishu-cursor-bridge', version: '0.1.0' };
    this.promptTimeoutMs = options.promptTimeoutMs || DEFAULT_PROMPT_TIMEOUT_MS;
    this.process = null;
    this.nextId = 1;
    this.pending = new Map();
    this.sessionId = null;
    this.hookContext = '';
    this.promptQueue = Promise.resolve();
    this.activePrompt = null;
    this._thoughtBuffer = '';
    this._thoughtStartMs = 0;
    this._sessionStartMs = 0;
  }

  start() {
    return new Promise((resolve, reject) => {
      const args = ['acp'];
      if (this.model) {
        args.push('--model', this.model);
      }
      this.process = spawn('agent', args, {
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
        if (this.hookRunner) {
          const durationMs = this._sessionStartMs ? Date.now() - this._sessionStartMs : 0;
          this.hookRunner.fireSessionEnd({
            conversationId: this.sessionId,
            sessionId: this.sessionId,
            reason: code === 0 ? 'completed' : 'error',
            durationMs
          }).catch(() => {});
        }
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
    this._sessionStartMs = Date.now();
    console.log('[Cursor] Session ready:', sessionId);

    if (this.hookRunner) {
      const { additionalContext } = await this.hookRunner.fireSessionStart({
        conversationId: sessionId,
        sessionId
      });
      if (additionalContext) {
        this.hookContext = additionalContext;
        console.log('[Cursor] Hook injected context:', additionalContext.length, 'chars');
      }
    }
  }

  // ── message router ──────────────────────────────────────────────

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
      this._handleSessionUpdate(msg.params?.update);
      return;
    }

    if (msg.method === 'session/request_permission') {
      this._handlePermissionRequest(msg);
      return;
    }

    const isCursorEvent = msg.method?.startsWith('cursor/') || msg.method?.startsWith('_cursor/');
    if (isCursorEvent) {
      const normalizedMethod = msg.method.replace(/^_cursor\//, 'cursor/');
      console.log('[Cursor] Extension event:', msg.method, '→', normalizedMethod, 'id=', msg.id);
      this._handleCursorEvent(msg, normalizedMethod);
      return;
    }

    if (msg.id && msg.method) {
      console.warn('[Cursor] Unhandled request, auto-acknowledging:', msg.method, 'id=', msg.id);
      this.respond(msg.id, { acknowledged: true });
      return;
    }

    console.log('[Cursor] Ignored message:', JSON.stringify(msg));
  }

  // ── session/update handling ─────────────────────────────────────

  _handleSessionUpdate(update) {
    const updateType = update?.sessionUpdate;

    if (updateType === 'agent_message_chunk' && update.content?.text) {
      this._flushThought();
      if (this.activePrompt?.onChunk) {
        this.activePrompt.onChunk(update.content.text);
      }
      this.emit('chunk', update.content.text);
      return;
    }

    if (updateType === 'agent_thought_chunk') {
      const text = update.content?.text || update.text || '';
      if (text) {
        if (!this._thoughtBuffer) {
          this._thoughtStartMs = Date.now();
        }
        this._thoughtBuffer += text;
      }
      return;
    }

    if (updateType === 'tool_call') {
      this._flushThought();
      const toolName = update.toolName || update.tool?.name || '';
      const toolInput = update.toolInput || update.tool?.input || {};
      console.log('[Cursor] Tool call:', toolName);

      if (this.activePrompt?.onToolStatus) {
        this.activePrompt.onToolStatus(toolName);
      }
      this.emit('tool_status', { type: 'tool_call', toolName });

      this._fireToolHooks(toolName, toolInput);
      return;
    }

    if (updateType === 'tool_call_update') {
      return;
    }

    console.log('[Cursor] Session update:', updateType || 'unknown');
  }

  _flushThought() {
    if (!this._thoughtBuffer || !this.hookRunner) return;
    const text = this._thoughtBuffer;
    const durationMs = Date.now() - this._thoughtStartMs;
    this._thoughtBuffer = '';
    this._thoughtStartMs = 0;

    this.hookRunner.fireAfterAgentThought({
      conversationId: this.sessionId,
      text,
      durationMs
    }).catch(() => {});
  }

  // ── permission request → preToolUse / before* hooks ─────────────

  async _handlePermissionRequest(msg) {
    const toolName = msg.params?.toolName || msg.params?.permissions?.[0]?.tool || '';
    const toolInput = msg.params?.toolInput || msg.params?.permissions?.[0]?.input || {};
    console.log('[Cursor] Permission request: id=', msg.id, 'tool=', toolName);

    if (!this.hookRunner) {
      this.respond(msg.id, { outcome: { outcome: 'selected', optionId: 'allow-once' } });
      return;
    }

    try {
      const { denied: preToolDenied } = await this.hookRunner.firePreToolUse({
        conversationId: this.sessionId,
        toolName,
        toolInput
      });
      if (preToolDenied) {
        console.log('[Cursor] preToolUse hook denied:', toolName);
        this.respond(msg.id, { outcome: { outcome: 'selected', optionId: 'reject-once' } });
        return;
      }

      let specificDenied = false;

      if (SHELL_TOOLS.has(toolName)) {
        const cmd = toolInput?.command || toolInput?.cmd || '';
        const result = await this.hookRunner.fireBeforeShellExecution({
          conversationId: this.sessionId,
          command: cmd,
          cwd: toolInput?.working_directory || toolInput?.cwd || this.cwd
        });
        specificDenied = result.denied;
      } else if (READ_TOOLS.has(toolName)) {
        const result = await this.hookRunner.fireBeforeReadFile({
          conversationId: this.sessionId,
          filePath: toolInput?.path || toolInput?.file_path || '',
          content: ''
        });
        specificDenied = result.denied;
      } else if (isMcpTool(toolName)) {
        const result = await this.hookRunner.fireBeforeMCPExecution({
          conversationId: this.sessionId,
          toolName,
          toolInput
        });
        specificDenied = result.denied;
      }

      if (specificDenied) {
        console.log('[Cursor] Specific before-hook denied:', toolName);
        this.respond(msg.id, { outcome: { outcome: 'selected', optionId: 'reject-once' } });
        return;
      }

      this.respond(msg.id, { outcome: { outcome: 'selected', optionId: 'allow-once' } });
    } catch (err) {
      console.error('[Cursor] Permission hook error, allowing:', err.message);
      this.respond(msg.id, { outcome: { outcome: 'selected', optionId: 'allow-once' } });
    }
  }

  // ── post-tool hooks by category ─────────────────────────────────

  _fireToolHooks(toolName, toolInput) {
    if (!this.hookRunner) return;
    const convId = this.sessionId;

    this.hookRunner.firePostToolUse({
      conversationId: convId,
      toolName,
      toolInput
    }).catch(() => {});

    if (SHELL_TOOLS.has(toolName)) {
      this.hookRunner.fireAfterShellExecution({
        conversationId: convId,
        command: toolInput?.command || toolInput?.cmd || ''
      }).catch(() => {});
    } else if (WRITE_TOOLS.has(toolName)) {
      this.hookRunner.fireAfterFileEdit({
        conversationId: convId,
        filePath: toolInput?.path || toolInput?.file_path || '',
        edits: toolInput?.old_string
          ? [{ old_string: toolInput.old_string, new_string: toolInput.new_string || '' }]
          : []
      }).catch(() => {});
    } else if (isMcpTool(toolName)) {
      this.hookRunner.fireAfterMCPExecution({
        conversationId: convId,
        toolName,
        toolInput
      }).catch(() => {});
    }
  }

  // ── cursor/* extension events → subagent hooks ──────────────────

  _handleCursorEvent(msg, normalizedMethod) {
    this.emit('cursor_event', { ...msg, method: normalizedMethod });

    if (!this.hookRunner) return;
    const params = msg.params || {};

    if (normalizedMethod === 'cursor/task') {
      if (params.status === 'running' || params.state === 'started') {
        this.hookRunner.fireSubagentStart({
          conversationId: this.sessionId,
          subagentId: params.taskId || params.id || '',
          subagentType: params.subagentType || params.type || 'generalPurpose',
          task: params.description || params.task || '',
          subagentModel: params.model || ''
        }).catch(() => {});
      } else if (params.status === 'completed' || params.status === 'error' || params.state === 'stopped') {
        this.hookRunner.fireSubagentStop({
          conversationId: this.sessionId,
          subagentType: params.subagentType || params.type || 'generalPurpose',
          status: params.status || 'completed',
          task: params.description || params.task || '',
          summary: params.summary || params.result || ''
        }).catch(() => {});
      }
    }
  }

  // ── transport ───────────────────────────────────────────────────

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

  // ── prompt ──────────────────────────────────────────────────────

  async prompt(message, options = {}) {
    const runPrompt = async () => {
      if (message.trim() === '/new') {
        const { sessionId } = await this.send('session/new', this.buildSessionParams());
        this.sessionId = sessionId;
        return { text: '✓ 新会话已创建', stopReason: 'new_session' };
      }

      if (this.hookRunner) {
        const { blocked, userMessage } = await this.hookRunner.fireBeforeSubmitPrompt({
          conversationId: this.sessionId,
          prompt: message
        });
        if (blocked) {
          console.log('[Cursor] beforeSubmitPrompt blocked:', userMessage);
          return { text: userMessage || '⛔ Prompt blocked by hook', stopReason: 'hook_blocked' };
        }
      }

      const contextBlock = this.hookContext
        ? `\n\n--- Hook Context ---\n${this.hookContext}\n--- End Hook Context ---\n`
        : '';

      const systemPrompt = `${APP_COMMANDS_INSTRUCTIONS}${contextBlock}

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

        this._flushThought();

        const text = fullResponse || this.extractTextFromResult(result);
        const stopReason = result?.stopReason || 'unknown';
        console.log('[Cursor] Prompt complete:', {
          sessionId: this.sessionId,
          stopReason,
          chunkCount,
          responseLength: text.length
        });
        this.emit('response', text);

        this._firePostPromptHooks(text, stopReason);

        return { text, stopReason };
      } catch (error) {
        this._flushThought();
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

  _firePostPromptHooks(text, stopReason) {
    if (!this.hookRunner) return;
    const convId = this.sessionId || 'unknown';

    this.hookRunner.fireAfterAgentResponse({
      conversationId: convId,
      text
    }).catch((err) => console.error('[HookRunner] afterAgentResponse error:', err.message));

    this.hookRunner.fireStop({
      conversationId: convId,
      status: stopReason === 'end_turn' ? 'completed' : stopReason
    }).catch((err) => console.error('[HookRunner] stop error:', err.message));
  }

  // ── helpers ─────────────────────────────────────────────────────

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
