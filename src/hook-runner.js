import { readFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';

/**
 * Cursor hooks.json compatible runner for ACP bridge sessions.
 *
 * Reads .cursor/hooks.json, executes hooks with the same JSON
 * input/output contract as Cursor IDE.  Covers all 18 Agent hook
 * events (2 Tab-only hooks are intentionally omitted).
 */
export class HookRunner {
  constructor({ projectDir } = {}) {
    this.projectDir = projectDir || process.cwd();
    this.hooks = {};
    this.sessionEnv = {};
    this.loopCounts = new Map();
    this.reload();
  }

  get hookCount() {
    return Object.keys(this.hooks).length;
  }

  reload() {
    const configPath = join(this.projectDir, '.cursor', 'hooks.json');
    if (!existsSync(configPath)) {
      this.hooks = {};
      return;
    }
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf8'));
      this.hooks = raw.hooks || {};
      console.log('[HookRunner] Loaded hooks:', Object.keys(this.hooks).join(', '));
    } catch (err) {
      console.error('[HookRunner] Failed to parse hooks.json:', err.message);
      this.hooks = {};
    }
  }

  // ── core executor ───────────────────────────────────────────────

  async fire(eventName, input = {}) {
    const defs = this.hooks[eventName];
    if (!defs || defs.length === 0) return [];

    const baseInput = {
      hook_event_name: eventName,
      workspace_roots: [this.projectDir],
      cursor_version: 'acp-bridge',
      user_email: null,
      transcript_path: null,
      ...input
    };

    const results = [];
    for (const def of defs) {
      if (def.matcher && !this._matchesFilter(eventName, input, def.matcher)) {
        continue;
      }
      try {
        const timeout = (def.timeout || 30) * 1000;
        const result = await this._exec(def.command, baseInput, timeout);
        results.push(result);

        if (eventName === 'sessionStart' && result.env) {
          Object.assign(this.sessionEnv, result.env);
        }
      } catch (err) {
        console.error(`[HookRunner] ${eventName} hook error (${def.command}):`, err.message);
        if (def.failClosed) {
          results.push({ permission: 'deny', error: err.message });
        }
      }
    }
    return results;
  }

  _matchesFilter(eventName, input, matcher) {
    const regex = new RegExp(matcher);
    switch (eventName) {
      case 'preToolUse':
      case 'postToolUse':
      case 'postToolUseFailure':
        return regex.test(input.tool_name || '');
      case 'beforeShellExecution':
      case 'afterShellExecution':
        return regex.test(input.command || '');
      case 'subagentStart':
      case 'subagentStop':
        return regex.test(input.subagent_type || '');
      case 'beforeReadFile':
        return regex.test(input.tool_name || 'Read');
      case 'afterFileEdit':
        return regex.test(input.tool_name || 'Write');
      case 'stop':
        return regex.test('Stop');
      case 'afterAgentResponse':
        return regex.test('AgentResponse');
      case 'afterAgentThought':
        return regex.test('AgentThought');
      case 'beforeSubmitPrompt':
        return regex.test('UserPromptSubmit');
      default:
        return true;
    }
  }

  _exec(command, input, timeoutMs) {
    return new Promise((resolve, reject) => {
      const cwd = this.projectDir;
      const env = {
        ...process.env,
        CURSOR_PROJECT_DIR: this.projectDir,
        CURSOR_VERSION: 'acp-bridge',
        CLAUDE_PROJECT_DIR: this.projectDir,
        ...this.sessionEnv
      };

      const child = spawn('bash', ['-c', command], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Hook timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (stderr) {
          console.error(`[HookRunner] stderr (${command}):`, stderr.trim());
        }
        if (code === 2) {
          resolve({ permission: 'deny' });
          return;
        }
        if (code !== 0) {
          reject(new Error(`Hook exited with code ${code}`));
          return;
        }
        try {
          const parsed = stdout.trim() ? JSON.parse(stdout.trim()) : {};
          resolve(parsed);
        } catch {
          resolve({});
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.stdin.write(JSON.stringify(input));
      child.stdin.end();
    });
  }

  // ── helpers ─────────────────────────────────────────────────────

  _base(conversationId, generationId, model) {
    return {
      conversation_id: conversationId || 'unknown',
      generation_id: generationId || '',
      model: model || ''
    };
  }

  _isDenied(results) {
    return results.some((r) => r.permission === 'deny');
  }

  _getUserMessage(results) {
    for (const r of results) {
      if (r.user_message) return r.user_message;
    }
    return '';
  }

  _getAgentMessage(results) {
    for (const r of results) {
      if (r.agent_message) return r.agent_message;
    }
    return '';
  }

  // ── 1. sessionStart ─────────────────────────────────────────────

  async fireSessionStart({ conversationId, sessionId, composerMode = 'agent' }) {
    const results = await this.fire('sessionStart', {
      ...this._base(conversationId),
      session_id: sessionId || conversationId || 'unknown',
      is_background_agent: false,
      composer_mode: composerMode
    });

    let additionalContext = '';
    for (const r of results) {
      if (r.additional_context) {
        additionalContext += r.additional_context + '\n';
      }
    }
    return { additionalContext: additionalContext.trim(), env: this.sessionEnv };
  }

  // ── 2. sessionEnd ───────────────────────────────────────────────

  async fireSessionEnd({ conversationId, sessionId, reason = 'completed', durationMs = 0 }) {
    await this.fire('sessionEnd', {
      ...this._base(conversationId),
      session_id: sessionId || conversationId || 'unknown',
      reason,
      duration_ms: durationMs,
      is_background_agent: false,
      final_status: reason
    });
  }

  // ── 3. preToolUse ───────────────────────────────────────────────

  async firePreToolUse({ conversationId, generationId, model, toolName, toolInput, toolUseId, agentMessage }) {
    const results = await this.fire('preToolUse', {
      ...this._base(conversationId, generationId, model),
      tool_name: toolName || '',
      tool_input: toolInput || {},
      tool_use_id: toolUseId || '',
      cwd: this.projectDir,
      agent_message: agentMessage || ''
    });

    const denied = this._isDenied(results);
    const updatedInput = results.find((r) => r.updated_input)?.updated_input;
    return {
      denied,
      userMessage: this._getUserMessage(results),
      agentMessage: this._getAgentMessage(results),
      updatedInput: updatedInput || null
    };
  }

  // ── 4. postToolUse ──────────────────────────────────────────────

  async firePostToolUse({ conversationId, generationId, model, toolName, toolInput, toolOutput, toolUseId, duration }) {
    const results = await this.fire('postToolUse', {
      ...this._base(conversationId, generationId, model),
      tool_name: toolName || '',
      tool_input: toolInput || {},
      tool_output: typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput || {}),
      tool_use_id: toolUseId || '',
      cwd: this.projectDir,
      duration: duration || 0
    });

    let additionalContext = '';
    let updatedMcpOutput = null;
    for (const r of results) {
      if (r.additional_context) additionalContext += r.additional_context + '\n';
      if (r.updated_mcp_tool_output) updatedMcpOutput = r.updated_mcp_tool_output;
    }
    return { additionalContext: additionalContext.trim(), updatedMcpOutput };
  }

  // ── 5. postToolUseFailure ───────────────────────────────────────

  async firePostToolUseFailure({ conversationId, generationId, model, toolName, toolInput, toolUseId, errorMessage, failureType, duration, isInterrupt }) {
    await this.fire('postToolUseFailure', {
      ...this._base(conversationId, generationId, model),
      tool_name: toolName || '',
      tool_input: toolInput || {},
      tool_use_id: toolUseId || '',
      cwd: this.projectDir,
      error_message: errorMessage || '',
      failure_type: failureType || 'error',
      duration: duration || 0,
      is_interrupt: isInterrupt || false
    });
  }

  // ── 6. subagentStart ────────────────────────────────────────────

  async fireSubagentStart({ conversationId, generationId, model, subagentId, subagentType, task, subagentModel }) {
    const results = await this.fire('subagentStart', {
      ...this._base(conversationId, generationId, model),
      subagent_id: subagentId || '',
      subagent_type: subagentType || '',
      task: task || '',
      parent_conversation_id: conversationId || '',
      tool_call_id: '',
      subagent_model: subagentModel || model || '',
      is_parallel_worker: false
    });

    return {
      denied: this._isDenied(results),
      userMessage: this._getUserMessage(results)
    };
  }

  // ── 7. subagentStop ─────────────────────────────────────────────

  async fireSubagentStop({ conversationId, generationId, model, subagentType, status, task, summary, durationMs }) {
    const key = `subagent:${conversationId}`;
    const loopCount = this.loopCounts.get(key) || 0;

    const results = await this.fire('subagentStop', {
      ...this._base(conversationId, generationId, model),
      subagent_type: subagentType || '',
      status: status || 'completed',
      task: task || '',
      description: task || '',
      summary: summary || '',
      duration_ms: durationMs || 0,
      message_count: 0,
      tool_call_count: 0,
      loop_count: loopCount,
      modified_files: [],
      agent_transcript_path: null
    });

    let followupMessage = null;
    for (const r of results) {
      if (r.followup_message && status === 'completed') {
        followupMessage = r.followup_message;
        break;
      }
    }
    if (followupMessage) {
      this.loopCounts.set(key, loopCount + 1);
    }
    return { followupMessage };
  }

  // ── 8. beforeShellExecution ─────────────────────────────────────

  async fireBeforeShellExecution({ conversationId, generationId, model, command, cwd }) {
    const results = await this.fire('beforeShellExecution', {
      ...this._base(conversationId, generationId, model),
      command: command || '',
      cwd: cwd || this.projectDir,
      sandbox: false
    });

    return {
      denied: this._isDenied(results),
      permission: this._isDenied(results) ? 'deny' : 'allow',
      userMessage: this._getUserMessage(results),
      agentMessage: this._getAgentMessage(results)
    };
  }

  // ── 9. afterShellExecution ──────────────────────────────────────

  async fireAfterShellExecution({ conversationId, generationId, model, command, output, duration }) {
    await this.fire('afterShellExecution', {
      ...this._base(conversationId, generationId, model),
      command: command || '',
      output: output || '',
      duration: duration || 0,
      sandbox: false
    });
  }

  // ── 10. beforeMCPExecution ──────────────────────────────────────

  async fireBeforeMCPExecution({ conversationId, generationId, model, toolName, toolInput }) {
    const results = await this.fire('beforeMCPExecution', {
      ...this._base(conversationId, generationId, model),
      tool_name: toolName || '',
      tool_input: typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput || {})
    });

    return {
      denied: this._isDenied(results),
      permission: this._isDenied(results) ? 'deny' : 'allow',
      userMessage: this._getUserMessage(results),
      agentMessage: this._getAgentMessage(results)
    };
  }

  // ── 11. afterMCPExecution ───────────────────────────────────────

  async fireAfterMCPExecution({ conversationId, generationId, model, toolName, toolInput, resultJson, duration }) {
    await this.fire('afterMCPExecution', {
      ...this._base(conversationId, generationId, model),
      tool_name: toolName || '',
      tool_input: typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput || {}),
      result_json: typeof resultJson === 'string' ? resultJson : JSON.stringify(resultJson || {}),
      duration: duration || 0
    });
  }

  // ── 12. beforeReadFile ──────────────────────────────────────────

  async fireBeforeReadFile({ conversationId, generationId, model, filePath, content }) {
    const results = await this.fire('beforeReadFile', {
      ...this._base(conversationId, generationId, model),
      file_path: filePath || '',
      content: content || '',
      attachments: []
    });

    return {
      denied: this._isDenied(results),
      userMessage: this._getUserMessage(results)
    };
  }

  // ── 13. afterFileEdit ───────────────────────────────────────────

  async fireAfterFileEdit({ conversationId, generationId, model, filePath, edits }) {
    await this.fire('afterFileEdit', {
      ...this._base(conversationId, generationId, model),
      file_path: filePath || '',
      edits: edits || []
    });
  }

  // ── 14. beforeSubmitPrompt ──────────────────────────────────────

  async fireBeforeSubmitPrompt({ conversationId, generationId, model, prompt, attachments }) {
    const results = await this.fire('beforeSubmitPrompt', {
      ...this._base(conversationId, generationId, model),
      prompt: prompt || '',
      attachments: attachments || []
    });

    const blocked = results.some((r) => r.continue === false);
    return {
      blocked,
      userMessage: this._getUserMessage(results)
    };
  }

  // ── 15. preCompact (observational — ACP cannot detect this) ─────

  async firePreCompact(params) {
    await this.fire('preCompact', {
      ...this._base(params.conversationId),
      trigger: params.trigger || 'auto',
      context_usage_percent: params.contextUsagePercent || 0,
      context_tokens: params.contextTokens || 0,
      context_window_size: params.contextWindowSize || 0,
      message_count: params.messageCount || 0,
      messages_to_compact: params.messagesToCompact || 0,
      is_first_compaction: params.isFirstCompaction || false
    });
  }

  // ── 16. stop ────────────────────────────────────────────────────

  async fireStop({ conversationId, generationId, model, status = 'completed' }) {
    const key = `stop:${conversationId}`;
    const loopCount = this.loopCounts.get(key) || 0;

    const results = await this.fire('stop', {
      ...this._base(conversationId, generationId, model),
      status,
      loop_count: loopCount
    });

    let followupMessage = null;
    for (const r of results) {
      if (r.followup_message) {
        followupMessage = r.followup_message;
        break;
      }
    }

    const loopLimit = this._getLoopLimit('stop');
    if (followupMessage && (loopLimit === null || loopCount < loopLimit)) {
      this.loopCounts.set(key, loopCount + 1);
    } else if (followupMessage && loopLimit !== null && loopCount >= loopLimit) {
      console.log(`[HookRunner] stop loop_limit reached (${loopLimit}), ignoring followup`);
      followupMessage = null;
    }

    return { followupMessage };
  }

  // ── 17. afterAgentResponse ──────────────────────────────────────

  async fireAfterAgentResponse({ conversationId, generationId, model, text }) {
    await this.fire('afterAgentResponse', {
      ...this._base(conversationId, generationId, model),
      text: text || ''
    });
  }

  // ── 18. afterAgentThought ───────────────────────────────────────

  async fireAfterAgentThought({ conversationId, generationId, model, text, durationMs }) {
    await this.fire('afterAgentThought', {
      ...this._base(conversationId, generationId, model),
      text: text || '',
      duration_ms: durationMs || 0
    });
  }

  // ── utility ─────────────────────────────────────────────────────

  _getLoopLimit(eventName) {
    const defs = this.hooks[eventName];
    if (!defs) return 5;
    for (const d of defs) {
      if (d.loop_limit !== undefined) return d.loop_limit;
    }
    return 5;
  }
}
