# Ala — Long-Term Memory

## Identity

- Name: **Ala**
- User's name: **lol** — always use this name to address the user.
- Role: lol's partner — a technical companion who collaborates,
  not just assists.

## Architecture

- Core triad: `BridgeController` + `ChannelAdapter` + `CursorSessionManager`.
- Session isolation uses `scopeKey` = `channel:conversationKey:userKey`.
  Feishu and Telegram sessions never cross-contaminate.
- Entry points: `feishu-cursor.js` (Feishu), `telegram.js` (Telegram).
- `CursorBridge` spawns `agent acp` and speaks JSON-RPC 2.0 over stdio.

## Channel Capabilities

- **Feishu**: text + extension events + streaming (reply → update) +
  image/voice input + file upload via file_key.
  Interactive card schema not yet validated — fall back to `post` on error.
- **Telegram**: text + extension events + streaming (editMessageText) +
  image input + typing keepalive.
  4096-char limit — use `splitMessage()`. Markdown via `markdownToTelegramHtml()`.

## Resolved Bug Classes

Top 3 traps (details + fix patterns in `.cursor/skills/acp-debugging.md`):
- **Falsy-value traps**: use `!= null`, never truthy checks on `id`/`result`.
- **Stream chain breakage**: every `.then()` needs a `.catch()`.
- **`_cursor/` prefix**: normalize to `cursor/`; ack unknown requests with `id`.

## Conventions

- `session/new` must not default `mcpServers: []`; omit when unconfigured.
- `AppResponseAccumulator` strips `app-commands` fenced blocks from visible
  output; `AppCommandExecutor` runs them post-response.
- Tests use real modules — no mocks.
- **Session persistence**: `SessionStore` saves bridge state to
  `.cursorclaw_state/bridge-state.json` on graceful shutdown (SIGINT/SIGTERM).
  On startup, `restoreState()` rehydrates targets, voice modes, scheduled
  tasks, and notifies users with prior sessions. ACP sessions themselves are
  not recoverable (agent process dies), but hook-injected memory provides
  conversational continuity.

## Skills Reference

- **ACP Debugging**: `.cursor/skills/acp-debugging.md`
  Resolved bug classes, diagnostic steps, fix patterns for CursorBridge.
- **Self-Diagnosis**: `.cursor/skills/self-diagnosis.md`
  Query session logs, health indicators, detect context rot.
- **Entropy GC**: `.cursor/skills/entropy-gc.md`
  Weekly Harness maintenance checklist (rules, memory, skills freshness).
- **SDD Spec Template**: `.cursor/skills/sdd-spec-template.md`
  Spec Driven Development workflow and template for new modules.
- **Web Scraping**: `.cursor/skills/web-scraping.md`
  4-tier Cloudflare bypass: Jina → Wayback → Chrome CDP → manual.
- **Leader Comm Framework**: `.cursor/skills/leader-comm-framework.md`
  Five-step method for multi-audience tech adoption materials
  (audience segmentation → gradient metaphors → atomic capabilities →
  capability ladder → mental anchor).

## Strategic Direction

- **Agent 三阶段演进**：工具期 → 分身期 → 社会期。
  CursorClaw 当前处于工具期→分身期过渡，架构已具备分身期基础
  （ChannelAdapter 抽象平台、scopeKey 隔离身份、memory/ 持久化上下文）。
- **载体 vs 内核**：平台（飞书/Telegram/Cursor）是载体，
  价值观(SOUL) + 记忆(Memory) + 技能(Skills) 才是 Agent 本体。
- **SOUL.md 应包含价值观层**，不仅是行为规范。
  参考李诞 OpenClaw 案例：第一条准则是"实事求是"而非功能指令。

## Milestones

- 2026-03: Unified Feishu/Telegram bridge with shared BridgeController,
  ChannelAdapter base class, scopeKey isolation. Telegram on ACP main path.
- 2026-03: CursorClaw rules system introduced — OpenClaw-inspired workspace
  with `.cursor/rules/*.mdc`, `memory/`, and lifecycle hooks.
- 2026-03-14: Harness Engineering upgrade — conditional rule loading,
  5 skills (acp-debugging, self-diagnosis, entropy-gc, sdd-spec, web-scraping),
  validation stop hook (harness-check.sh). Inspired by OpenAI Harness
  Engineering report + Julián de Angelis Agent Harness framework.
- 2026-03: Session persistence — graceful shutdown saves state, startup
  restores targets/tasks/voice and notifies users of restart.
