#!/bin/bash
#
# CursorClaw Setup Script / CursorClaw 安装脚本
#
# Usage:
#   bash setup-claw.sh                # Project-level install / 项目级安装
#   bash setup-claw.sh --global       # User-level install / 用户级安装
#   bash setup-claw.sh --bridge       # Bridge project setup / 桥接项目安装
#   bash setup-claw.sh --help         # Show help / 显示帮助
#

set -euo pipefail

REPO_URL="https://raw.githubusercontent.com/c4bbage/CursorClaw/main"
GLOBAL=false
BRIDGE=false

usage() {
  cat <<'USAGE'
CursorClaw Setup — AI agent memory system for Cursor IDE
CursorClaw 安装 — Cursor IDE 的 AI 助手记忆系统

Usage / 用法:
  bash setup-claw.sh              Project-level install / 项目级安装
  bash setup-claw.sh --global     User-level install / 用户级安装
  bash setup-claw.sh --bridge     Bridge project setup / 桥接项目安装
  bash setup-claw.sh --help       Show this message / 显示帮助

Modes / 模式:

  (default)    Installs rules, hooks, and memory into the current project.
               在当前项目安装 rules、hooks 和 memory。

  --global     Installs into ~/.cursor/ (applies to all projects).
               安装到 ~/.cursor/（所有项目生效）。

  --bridge     Everything in default + installs npm deps + generates .env.
               默认模式的全部内容 + 安装 npm 依赖 + 生成 .env 文件。
               Use this when setting up the CursorClaw Bridge for Feishu/Telegram.
               在搭建飞书/Telegram 桥接服务时使用此模式。

USAGE
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    --global) GLOBAL=true ;;
    --bridge) BRIDGE=true ;;
    --help|-h) usage ;;
  esac
done

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed. / 错误：需要 jq 但未安装。"
  echo "  macOS:  brew install jq"
  echo "  Ubuntu: sudo apt install jq"
  exit 1
fi

if [ "$GLOBAL" = true ]; then
  TARGET_DIR="$HOME/.cursor"
  MEMORY_DIR="$HOME/cursorclaw-memory"
  HOOK_PREFIX="./hooks"
  echo "=== CursorClaw: User-level install / 用户级安装 ==="
  echo "  Rules:  $TARGET_DIR/rules/"
  echo "  Hooks:  $TARGET_DIR/hooks/"
  echo "  Memory: $MEMORY_DIR/"
else
  TARGET_DIR=".cursor"
  MEMORY_DIR="memory"
  HOOK_PREFIX=".cursor/hooks"
  if [ "$BRIDGE" = true ]; then
    echo "=== CursorClaw: Bridge project setup / 桥接项目安装 ==="
  else
    echo "=== CursorClaw: Project-level install / 项目级安装 ==="
  fi
  echo "  Rules:  $TARGET_DIR/rules/"
  echo "  Hooks:  $TARGET_DIR/hooks/"
  echo "  Memory: $MEMORY_DIR/"
fi

echo ""

mkdir -p "$TARGET_DIR/rules"
mkdir -p "$TARGET_DIR/hooks"
mkdir -p "$MEMORY_DIR"

# ─── Rules ────────────────────────────────────────────────────────

write_if_missing() {
  local path="$1"
  if [ -f "$path" ]; then
    echo "  SKIP  $path (exists / 已存在)"
    return
  fi
  cat > "$path"
  echo "  CREATE $path"
}

write_if_missing "$TARGET_DIR/rules/agents.mdc" <<'MDC'
---
description: CursorClaw operating instructions — loaded every session
alwaysApply: true
---

# CursorClaw — Operating Instructions

## Session Start Protocol (required)

Before responding to any user message:

1. Read `memory/MEMORY.md` for long-term project knowledge.
2. Read today's daily log: `memory/YYYY-MM-DD.md` (use actual date).
3. Read yesterday's daily log if it exists.
4. If a `sessionStart` hook already injected memory via `additional_context`,
   skip the reads above — the content is already in context.

## Project Overview

(Describe your project here: what it does, core modules, entry points.)
(在这里描述你的项目：做什么、核心模块、入口文件。)

## Safety Defaults

- Never run destructive commands unless explicitly asked.
- Never expose API keys, tokens, or secrets in chat output.
- Never simulate or mock code — all implementations must be real.
- Read a file before attempting to edit it.
- Include info useful for debugging in program output.
MDC

write_if_missing "$TARGET_DIR/rules/soul.mdc" <<'MDC'
---
description: Agent persona, tone, and behavioral boundaries
alwaysApply: true
---

# CursorClaw — Soul

## Identity

You are Claw, a project-level technical assistant.
You are a fresh instance each session — continuity lives in `memory/` files
and these rules. Treat memory files as your long-term brain.

## Tone

- Direct and technical. Concise over verbose.
- Respond in the user's language.
- When explaining architecture, prefer diagrams (mermaid) over text walls.

## Boundaries

- Never fabricate code: every implementation must be runnable as-is.
- Always read a file before editing it.
- If uncertain, state the uncertainty explicitly rather than guessing.
- If a task is ambiguous, ask one or two clarifying questions first.

## Working Style

- Prefer editing existing files over creating new ones.
- When fixing bugs, trace the root cause first; do not patch symptoms.
- After substantive edits, check for linter errors and fix any you introduced.
MDC

write_if_missing "$TARGET_DIR/rules/tools.mdc" <<'MDC'
---
description: Tool and dependency conventions for this project
alwaysApply: true
---

# CursorClaw — Tools & Dependencies

(Add your project-specific tool notes, SDK gotchas, and conventions here.)
(在这里添加你的项目工具备忘、SDK 注意事项和约定。)

## Example

- Framework version: ...
- Package manager: npm / pnpm / yarn / uv
- Key dependencies and their quirks: ...
- Common pitfalls to avoid: ...
MDC

write_if_missing "$TARGET_DIR/rules/memory-protocol.mdc" <<'MDC'
---
description: Memory read/write protocol for cross-session continuity
alwaysApply: true
---

# CursorClaw — Memory Protocol

## Directory Layout

```
memory/
  MEMORY.md           # Long-term curated knowledge (committed to git)
  YYYY-MM-DD.md       # Daily session logs (gitignored)
```

## Long-Term Memory (`memory/MEMORY.md`)

Stores durable facts: architecture decisions, project milestones, resolved
bug classes, established conventions. Keep under 200 lines.

## Daily Log (`memory/YYYY-MM-DD.md`)

One file per day. Format:

```markdown
# YYYY-MM-DD

## HH:MM Session — [brief topic]
- What was done
- Decisions made
- Issues found / resolved
```

## Read Protocol

At session start (before first response):
1. Read `memory/MEMORY.md`.
2. Read today's file: `memory/<today>.md`.
3. Read yesterday's file: `memory/<yesterday>.md` (skip if absent).

## Write Protocol

Capture to today's daily log when:
- A bug is found or fixed.
- An architecture or design decision is made.
- A new convention is established.

Update `memory/MEMORY.md` when a learning is broadly reusable.

## Maintenance

- Daily logs older than 7 days: only read if explicitly needed.
- Prune `MEMORY.md` entries that are superseded.
MDC

# ─── Hooks ─────────────────────────────────────────────────────────

write_if_missing "$TARGET_DIR/hooks/log-event.sh" <<'HOOK'
#!/bin/bash
set -euo pipefail

INPUT=$(cat)

PROJECT_DIR="${CURSOR_PROJECT_DIR:-.}"
LOG_ROOT="${PROJECT_DIR}/.cursor/logs"

TODAY=$(date +%Y-%m-%d)
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

CONV_ID=$(echo "$INPUT" | jq -r '.conversation_id // "unknown"')
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // "unknown"')
GEN_ID=$(echo "$INPUT" | jq -r '.generation_id // ""')
MODEL=$(echo "$INPUT" | jq -r '.model // ""')

CONV_DIR="${LOG_ROOT}/${TODAY}/${CONV_ID}"
mkdir -p "$CONV_DIR"

case "$HOOK_EVENT" in
  sessionStart)
    SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
    IS_BG=$(echo "$INPUT" | jq -r '.is_background_agent // false')
    MODE=$(echo "$INPUT" | jq -r '.composer_mode // ""')
    jq -n \
      --arg ts "$NOW" --arg event "$HOOK_EVENT" --arg sid "$SESSION_ID" \
      --arg model "$MODEL" --argjson bg "$IS_BG" --arg mode "$MODE" \
      '{ts:$ts,event:$event,session_id:$sid,model:$model,is_background:$bg,mode:$mode}' \
      >> "${CONV_DIR}/session.jsonl"
    ;;
  sessionEnd)
    SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
    REASON=$(echo "$INPUT" | jq -r '.reason // ""')
    DURATION=$(echo "$INPUT" | jq -r '.duration_ms // 0')
    jq -n \
      --arg ts "$NOW" --arg event "$HOOK_EVENT" --arg sid "$SESSION_ID" \
      --arg reason "$REASON" --argjson dur "$DURATION" \
      '{ts:$ts,event:$event,session_id:$sid,reason:$reason,duration_ms:$dur}' \
      >> "${CONV_DIR}/session.jsonl"
    ;;
  afterAgentThought)
    TEXT=$(echo "$INPUT" | jq -r '.text // ""')
    THINK_DUR=$(echo "$INPUT" | jq -r '.duration_ms // 0')
    jq -n \
      --arg ts "$NOW" --arg gen "$GEN_ID" --arg model "$MODEL" \
      --arg text "$TEXT" --argjson dur "$THINK_DUR" \
      '{ts:$ts,generation_id:$gen,model:$model,duration_ms:$dur,text:$text}' \
      >> "${CONV_DIR}/thoughts.jsonl"
    ;;
  afterAgentResponse)
    TEXT=$(echo "$INPUT" | jq -r '.text // ""')
    jq -n \
      --arg ts "$NOW" --arg gen "$GEN_ID" --arg model "$MODEL" --arg text "$TEXT" \
      '{ts:$ts,generation_id:$gen,model:$model,text:$text}' \
      >> "${CONV_DIR}/responses.jsonl"
    ;;
  postToolUse)
    TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
    TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')
    DURATION=$(echo "$INPUT" | jq -r '.duration // 0')
    jq -n \
      --arg ts "$NOW" --arg gen "$GEN_ID" --arg tool "$TOOL" \
      --argjson input "$TOOL_INPUT" --argjson dur "$DURATION" \
      '{ts:$ts,generation_id:$gen,tool:$tool,duration_ms:$dur,input:$input}' \
      >> "${CONV_DIR}/tools.jsonl"
    ;;
  *)
    jq -n --arg ts "$NOW" --arg event "$HOOK_EVENT" --argjson raw "$INPUT" \
      '{ts:$ts,event:$event,raw:$raw}' >> "${CONV_DIR}/unknown.jsonl"
    ;;
esac

exit 0
HOOK

write_if_missing "$TARGET_DIR/hooks/session-memory.sh" <<'HOOK'
#!/bin/bash
set -euo pipefail

cat > /dev/null

PROJECT_DIR="${CURSOR_PROJECT_DIR:-.}"
MEMORY_DIR="${PROJECT_DIR}/memory"
MAX_CHARS=8000

TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d 2>/dev/null || "")

CONTEXT=""

if [ -f "${MEMORY_DIR}/MEMORY.md" ]; then
  CONTENT=$(head -c 3000 "${MEMORY_DIR}/MEMORY.md")
  CONTEXT="${CONTEXT}## Long-Term Memory (memory/MEMORY.md)\n\n${CONTENT}\n\n"
fi

if [ -f "${MEMORY_DIR}/${TODAY}.md" ]; then
  CONTENT=$(tail -c 3000 "${MEMORY_DIR}/${TODAY}.md")
  CONTEXT="${CONTEXT}## Today's Log (memory/${TODAY}.md)\n\n${CONTENT}\n\n"
fi

if [ -n "$YESTERDAY" ] && [ -f "${MEMORY_DIR}/${YESTERDAY}.md" ]; then
  CONTENT=$(tail -c 2000 "${MEMORY_DIR}/${YESTERDAY}.md")
  CONTEXT="${CONTEXT}## Yesterday's Log (memory/${YESTERDAY}.md)\n\n${CONTENT}\n\n"
fi

if [ -z "$CONTEXT" ]; then
  echo '{}'
  exit 0
fi

CONTEXT=$(echo -n "$CONTEXT" | head -c "$MAX_CHARS")
jq -n --arg ctx "$CONTEXT" '{"additional_context": $ctx}'
exit 0
HOOK

write_if_missing "$TARGET_DIR/hooks/session-summary.sh" <<'HOOK'
#!/bin/bash
set -uo pipefail

INPUT=$(cat)

PROJECT_DIR="${CURSOR_PROJECT_DIR:-.}"
MEMORY_DIR="${PROJECT_DIR}/memory"
LOG_ROOT="${PROJECT_DIR}/.cursor/logs"

TODAY=$(date +%Y-%m-%d)
NOW_TIME=$(date +%H:%M)

CONV_ID=$(echo "$INPUT" | jq -r '.conversation_id // "unknown"' 2>/dev/null || echo "unknown")
STATUS=$(echo "$INPUT" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

CONV_LOG_DIR="${LOG_ROOT}/${TODAY}/${CONV_ID}"

if [ ! -d "$CONV_LOG_DIR" ]; then
  echo '{}'
  exit 0
fi

mkdir -p "$MEMORY_DIR"
SUMMARY=""

if [ -f "${CONV_LOG_DIR}/tools.jsonl" ]; then
  TOOL_COUNT=$(wc -l < "${CONV_LOG_DIR}/tools.jsonl" | tr -d ' ')
  TOOLS_USED=$(jq -r '.tool // empty' "${CONV_LOG_DIR}/tools.jsonl" 2>/dev/null | sort -u | head -10 | paste -sd ", " - 2>/dev/null || echo "")
  [ -n "$TOOLS_USED" ] && SUMMARY="${SUMMARY}- Tools (${TOOL_COUNT} calls): ${TOOLS_USED}\n"
fi

if [ -f "${CONV_LOG_DIR}/responses.jsonl" ]; then
  RESP_COUNT=$(wc -l < "${CONV_LOG_DIR}/responses.jsonl" | tr -d ' ')
  LAST_RESPONSE=$(tail -1 "${CONV_LOG_DIR}/responses.jsonl" | jq -r '.text // ""' 2>/dev/null || echo "")
  SUMMARY="${SUMMARY}- Responses: ${RESP_COUNT} total\n"
  if [ -n "$LAST_RESPONSE" ]; then
    LAST_LINE=$(echo "$LAST_RESPONSE" | head -1 | head -c 120)
    SUMMARY="${SUMMARY}- Last: ${LAST_LINE}...\n"
  fi
fi

if [ -f "${CONV_LOG_DIR}/thoughts.jsonl" ]; then
  THOUGHT_COUNT=$(wc -l < "${CONV_LOG_DIR}/thoughts.jsonl" | tr -d ' ')
  SUMMARY="${SUMMARY}- Thoughts: ${THOUGHT_COUNT} blocks\n"
fi

if [ -z "$SUMMARY" ]; then
  echo '{}'
  exit 0
fi

DAILY_FILE="${MEMORY_DIR}/${TODAY}.md"
if [ ! -f "$DAILY_FILE" ]; then
  echo "# ${TODAY}" > "$DAILY_FILE"
  echo "" >> "$DAILY_FILE"
fi

{
  echo ""
  echo "## ${NOW_TIME} Session (${STATUS}) — conv:${CONV_ID:0:8}"
  echo -e "$SUMMARY"
} >> "$DAILY_FILE"

echo '{}'
exit 0
HOOK

chmod +x "$TARGET_DIR/hooks/"*.sh

# ─── hooks.json ────────────────────────────────────────────────────

if [ "$GLOBAL" = true ]; then
  HOOK_LOG="./hooks/log-event.sh"
  HOOK_MEM="./hooks/session-memory.sh"
  HOOK_SUM="./hooks/session-summary.sh"
else
  HOOK_LOG=".cursor/hooks/log-event.sh"
  HOOK_MEM=".cursor/hooks/session-memory.sh"
  HOOK_SUM=".cursor/hooks/session-summary.sh"
fi

write_if_missing "$TARGET_DIR/hooks.json" <<HOOKJSON
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "${HOOK_LOG}" },
      { "command": "${HOOK_MEM}" }
    ],
    "stop": [
      { "command": "${HOOK_SUM}" }
    ],
    "sessionEnd": [
      { "command": "${HOOK_LOG}" }
    ],
    "afterAgentThought": [
      { "command": "${HOOK_LOG}" }
    ],
    "afterAgentResponse": [
      { "command": "${HOOK_LOG}" }
    ],
    "postToolUse": [
      { "command": "${HOOK_LOG}" }
    ]
  }
}
HOOKJSON

# ─── Memory seed / 记忆初始化 ─────────────────────────────────────

write_if_missing "$MEMORY_DIR/MEMORY.md" <<'SEED'
# Project Memory

(Add your project knowledge here: architecture, conventions, lessons learned.)
(在这里添加你的项目知识：架构、约定、经验教训。)
SEED

touch "$MEMORY_DIR/.gitkeep"

# ─── Bridge mode / 桥接模式 ───────────────────────────────────────

if [ "$BRIDGE" = true ]; then
  echo ""
  echo "=== Bridge Setup / 桥接服务安装 ==="

  # Generate .env from .env.example
  if [ -f ".env.example" ] && [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  CREATE .env (copied from .env.example / 从 .env.example 复制)"
    echo "  ⚠  Edit .env with your credentials / 请编辑 .env 填入你的凭据"
  elif [ -f ".env" ]; then
    echo "  SKIP  .env (exists / 已存在)"
  else
    write_if_missing ".env.example" <<'ENVEXAMPLE'
FEISHU_APP_ID=your_feishu_app_id
FEISHU_APP_SECRET=your_feishu_app_secret
# Comma-separated open_id allowlist (empty = allow all)
# 逗号分隔的 open_id 白名单（空 = 允许所有人）
FEISHU_ALLOWED_USERS=
FEISHU_ALLOWED_CHATS=

TELEGRAM_BOT_TOKEN=your_telegram_bot_token
# Comma-separated numeric user ID allowlist (empty = allow all)
# 逗号分隔的用户 ID 白名单（空 = 允许所有人）
TELEGRAM_ALLOWED_USERS=
TELEGRAM_ALLOWED_CHATS=

# ElevenLabs (TTS + STT, optional / 可选)
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ENVEXAMPLE
    cp .env.example .env
    echo "  CREATE .env.example"
    echo "  CREATE .env (copied from .env.example)"
    echo "  ⚠  Edit .env with your credentials / 请编辑 .env 填入你的凭据"
  fi

  # npm install
  if [ -f "package.json" ]; then
    if [ ! -d "node_modules" ]; then
      echo ""
      echo "  Installing npm dependencies... / 安装 npm 依赖..."
      npm install --silent 2>&1 | tail -3
      echo "  ✓ npm install complete / npm 安装完成"
    else
      echo "  SKIP  npm install (node_modules exists / 已存在)"
    fi
  fi

  # Check agent CLI
  echo ""
  if command -v agent &>/dev/null; then
    echo "  ✓ Cursor CLI (agent) found / Cursor CLI 已找到"
  else
    echo "  ⚠  Cursor CLI (agent) not found in PATH / 未在 PATH 中找到"
    echo "     Install Cursor, then run: agent login"
    echo "     安装 Cursor 后运行：agent login"
  fi
fi

# ─── .gitignore hints / .gitignore 建议 ───────────────────────────

if [ "$GLOBAL" = false ]; then
  echo ""
  echo "=== .gitignore ==="
  echo "Add these lines to track rules but ignore logs:"
  echo "将以下内容加入 .gitignore 以跟踪规则但忽略日志："
  echo ""
  cat <<'GITIGNORE'
  # CursorClaw
  !.cursor/
  .cursor/*
  !.cursor/hooks.json
  !.cursor/hooks/
  .cursor/hooks/*
  !.cursor/hooks/*.sh
  !.cursor/rules/
  .cursor/rules/*
  !.cursor/rules/*.mdc
  !memory/
  !memory/MEMORY.md
  !memory/.gitkeep
  memory/*.md
  !memory/MEMORY.md
GITIGNORE
fi

# ─── Done / 完成 ──────────────────────────────────────────────────

echo ""
echo "=== Done! / 完成！ ==="
echo ""
echo "Next steps / 下一步："
echo "  1. Edit $TARGET_DIR/rules/soul.mdc  — define your Claw's personality / 定义人格风格"
echo "  2. Edit $TARGET_DIR/rules/agents.mdc — add your project overview / 添加项目概述"
echo "  3. Edit $TARGET_DIR/rules/tools.mdc  — add your tool notes / 添加工具备忘"
echo "  4. Edit $MEMORY_DIR/MEMORY.md        — seed your project knowledge / 初始化项目知识"

if [ "$BRIDGE" = true ]; then
  echo ""
  echo "Bridge-specific / 桥接服务："
  echo "  5. Edit .env                        — fill in bot credentials / 填入 Bot 凭据"
  echo "  6. Run: agent login                 — authenticate Cursor CLI / 登录 Cursor CLI"
  echo "  7. Run: npm start                   — start Feishu bridge / 启动飞书桥接"
  echo "     Run: npm run start:telegram      — start Telegram bridge / 启动 Telegram 桥接"
fi

echo ""
echo "Docs: https://github.com/c4bbage/CursorClaw/blob/main/docs/cursorclaw-quickstart.md"
