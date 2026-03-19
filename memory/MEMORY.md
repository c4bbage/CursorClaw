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

- **Falsy-value traps**: `id=0` and `result=null` are valid JSON-RPC values.
  Always use `!= null`, never truthy checks.
- **`_cursor/` prefix**: Extension methods arrive as both `cursor/` and
  `_cursor/`. Normalize to `cursor/`. Unknown requests with `id` must be
  ack'd or the agent hangs.
- **Stream chain breakage**: Every `.then()` in the update promise chain
  needs a `.catch()`. Missing catches prevent `finalize()` from executing.
- **Prompt timeout**: 5-minute default. On timeout, `cancelCurrentPrompt()`
  sends `session/cancel` and returns partial response.

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

## Milestones

- 2026-03: Unified Feishu/Telegram bridge with shared BridgeController,
  ChannelAdapter base class, scopeKey isolation. Telegram on ACP main path.
- 2026-03: CursorClaw rules system introduced — OpenClaw-inspired workspace
  with `.cursor/rules/*.mdc`, `memory/`, and lifecycle hooks.
- 2026-03: Session persistence — graceful shutdown saves state, startup
  restores targets/tasks/voice and notifies users of restart.
