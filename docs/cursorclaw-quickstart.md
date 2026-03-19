# CursorClaw Quickstart / 快速上手

CursorClaw has two parts:
- **CursorClaw (IDE)** — Rules + Hooks + Memory for Cursor Agent inside the IDE
- **CursorClaw Bridge** — Run Cursor Agent from Feishu and Telegram

CursorClaw 包含两部分：
- **CursorClaw (IDE)** — 在 Cursor IDE 内使用的 Rules + Hooks + Memory 系统
- **CursorClaw Bridge** — 通过飞书/Telegram 使用 Cursor Agent 的桥接服务

---

## Prerequisites / 前置要求

| Requirement | Installation |
|---|---|
| [Cursor IDE](https://cursor.com/) | Download from website |
| Cursor CLI (`agent` command) | `agent login` after installing Cursor |
| Node.js >= 18 | [nodejs.org](https://nodejs.org) |
| `jq` (for hooks) | macOS: `brew install jq` / Ubuntu: `sudo apt install jq` |

---

## Part 1: CursorClaw for IDE / IDE 端安装

This sets up Rules, Hooks, and Memory. Your Cursor Agent gets cross-session memory and project awareness.

这部分安装 Rules、Hooks 和 Memory 系统。安装后 Cursor Agent 会拥有跨会话记忆和项目认知。

### One-line install / 一键安装

```bash
# Project-level (recommended, shared via git)
# 项目级安装（推荐，通过 git 共享给团队）
cd /your/project
bash setup-claw.sh

# OR: User-level (applies to all projects)
# 或者：用户级安装（所有项目生效）
bash setup-claw.sh --global
```

### What it creates / 安装内容

```
your-project/
├── .cursor/
│   ├── hooks.json                # Hook registration / Hook 注册
│   ├── hooks/
│   │   ├── log-event.sh          # Event logger / 事件日志
│   │   ├── session-memory.sh     # Memory injection / 记忆注入
│   │   └── session-summary.sh    # Session summary / 会话摘要
│   └── rules/
│       ├── agents.mdc            # Project knowledge / 项目知识 ← customize
│       ├── soul.mdc              # Persona & tone / 人格风格 ← customize
│       ├── tools.mdc             # Tool notes / 工具备忘 ← customize
│       └── memory-protocol.mdc   # Memory protocol / 记忆协议
├── memory/
│   ├── MEMORY.md                 # Long-term memory / 长期记忆 ← customize
│   └── .gitkeep
```

### Verify / 验证

Open a new Agent chat in Cursor and send:

在 Cursor 里开一个新的 Agent 对话，发送：

```
Who are you? What project memory do you have?
```

The agent should know its identity (from `soul.mdc`) and mention the memory system.

Agent 应该知道自己的身份（来自 `soul.mdc`）并提到记忆系统。

---

## Part 2: CursorClaw Bridge / 桥接服务安装

This lets you use Cursor Agent from Feishu (Lark) or Telegram.

这部分让你可以通过飞书或 Telegram 使用 Cursor Agent。

### Step 1: Clone & Install / 克隆和安装

```bash
git clone https://github.com/c4bbage/CursorClaw.git
cd CursorClaw
npm install
```

### Step 2: Configure `.env` / 配置环境变量

```bash
cp .env.example .env
```

Edit `.env` with your credentials / 编辑 `.env` 填入你的凭据：

```bash
# ── Feishu (Lark) ─────────────────────────────
# Create a bot at https://open.feishu.cn/app
# 在飞书开放平台创建机器人
FEISHU_APP_ID=cli_xxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxx
# Comma-separated open_id allowlist (empty = allow all)
# 逗号分隔的 open_id 白名单（空 = 允许所有人）
FEISHU_ALLOWED_USERS=
FEISHU_ALLOWED_CHATS=

# ── Telegram ──────────────────────────────────
# Get token from @BotFather
# 从 @BotFather 获取 Token
TELEGRAM_BOT_TOKEN=xxxxxxxxxx:xxxxxxxxxxx
# Comma-separated numeric user ID allowlist
# 逗号分隔的用户 ID 白名单
TELEGRAM_ALLOWED_USERS=
TELEGRAM_ALLOWED_CHATS=

# ── ElevenLabs (optional, for voice) ──────────
# Get API key from https://elevenlabs.io
ELEVENLABS_API_KEY=
# Voice ID (browse https://elevenlabs.io/app/voice-library)
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
```

### Step 3: Authenticate Cursor CLI / 登录 Cursor CLI

```bash
agent login
```

Make sure the `agent` command is available in your PATH.

确保 `agent` 命令在 PATH 中可用。

### Step 4: Run / 运行

```bash
# Feishu bridge / 飞书桥接
npm start

# Telegram bridge / Telegram 桥接
npm run start:telegram

# Both (separate terminals) / 同时运行（分开终端）
npm start &
npm run start:telegram
```

You should see:

```
[HookRunner] Loaded hooks: sessionStart, stop, sessionEnd, ...
[Telegram] Bot started, commands registered: /help, /cancel, ...
Telegram ↔ Cursor Bridge started!
```

### Step 4b: Run for a Different Project / 在其他项目目录运行

CursorClaw Bridge code and the target project can be in different directories. The Bridge reads `.cursor/rules`, `memory/`, and hooks from the **project directory**, not from the Bridge code directory.

Bridge 代码和目标项目可以在不同目录。Bridge 从**项目目录**读取 `.cursor/rules`、`memory/` 和 hooks，而不是 Bridge 代码目录。

Three ways to specify the project directory / 三种指定项目目录的方式：

**Method 1: Environment variable / 环境变量**

```bash
# In .env or export
# 在 .env 中或 export
CURSOR_PROJECT_DIR=/path/to/your/project
```

**Method 2: Command line argument / 命令行参数**

```bash
# Pass as argument / 作为参数传递
node telegram.js /path/to/your/project
node feishu-cursor.js /path/to/your/project
```

**Method 3: Run from the project directory / 从项目目录运行**

```bash
cd /path/to/your/project
node /path/to/CursorClaw/telegram.js
```

Example: Bridge code in `~/CursorClaw`, target project in `~/my-app`:

例子：Bridge 代码在 `~/CursorClaw`，目标项目在 `~/my-app`：

```bash
# First, set up CursorClaw rules in the target project
# 先在目标项目中安装 CursorClaw 规则
cd ~/my-app
bash ~/CursorClaw/setup-claw.sh

# Then run the Bridge pointing to the target project
# 然后启动 Bridge 指向目标项目
cd ~/CursorClaw
CURSOR_PROJECT_DIR=~/my-app node telegram.js

# Or equivalently / 或者等价地
node telegram.js ~/my-app
```

The agent will read `~/my-app/.cursor/rules/`, use `~/my-app/memory/`, and execute file operations in `~/my-app/`.

Agent 会读取 `~/my-app/.cursor/rules/`，使用 `~/my-app/memory/`，并在 `~/my-app/` 中执行文件操作。

### Step 5: Test / 测试

Send a message to your bot. The first message creates an ACP session (takes a few seconds), then you'll see streaming replies.

给你的 Bot 发一条消息。第一条消息会创建 ACP 会话（需要几秒），之后就能看到流式回复。

---

## Getting User IDs / 获取用户 ID

### Telegram

1. Start the bridge without allowlist (leave `TELEGRAM_ALLOWED_USERS` empty)
2. Send a message — your user ID appears in the logs as `userKey`
3. Or message `@userinfobot` on Telegram to get your ID

1. 先不配白名单启动
2. 发一条消息，日志里的 `userKey` 就是你的 ID
3. 或者给 `@userinfobot` 发消息获取 ID

### Feishu / 飞书

1. Start the bridge without allowlist
2. Send a message — your `open_id` appears in logs as `userKey`

1. 先不配白名单启动
2. 发一条消息，日志里的 `userKey` 就是 `open_id`

---

## Bot Commands / 机器人命令

| Command | Description / 说明 |
|---|---|
| `/help` | Show commands / 显示命令列表 |
| `/cancel` | Cancel current task / 取消当前任务 |
| `/status` | Session status / 会话状态 |
| `/memory` | View project memory / 查看项目记忆 |
| `/clear` | Reset session / 重置会话 |
| `/tasks` | List scheduled tasks / 查看定时任务 |
| `/voice` | Toggle voice reply / 开关语音回复 |

---

## Voice Setup / 语音配置

Requires [ElevenLabs](https://elevenlabs.io) API key in `.env`.

需要在 `.env` 配置 [ElevenLabs](https://elevenlabs.io) API Key。

### Voice Input (STT) / 语音输入

Send a voice message in Telegram or Feishu. It's automatically transcribed and processed.

在 Telegram 或飞书中发送语音消息，系统自动转写后处理。

- **Telegram**: OGG → ElevenLabs STT
- **Feishu / 飞书**: Built-in STT first, falls back to ElevenLabs / 先用内置 STT，失败降级到 ElevenLabs

### Voice Output (TTS) / 语音输出

Send `/voice` to enable. Every text reply will also have an audio version.

发送 `/voice` 开启。之后每条文字回复都会附带一条语音。

### Change Voice / 更换声音

Browse [ElevenLabs Voice Library](https://elevenlabs.io/app/voice-library), find a voice you like, copy its ID, and set `ELEVENLABS_VOICE_ID` in `.env`.

在 [ElevenLabs 声音库](https://elevenlabs.io/app/voice-library) 选择喜欢的声音，复制 ID 填入 `.env` 的 `ELEVENLABS_VOICE_ID`。

---

## Customization / 个性化定制

### Agent Persona / Agent 人格

Edit `.cursor/rules/soul.mdc`:

编辑 `.cursor/rules/soul.mdc`：

**Precise Engineer / 严谨工程师**
```markdown
## Identity
You are Claw, a senior systems engineer. Precision over speed.
## Tone
- Formal and precise. Every claim backed by evidence.
- Respond in English unless the user writes in another language.
```

**Fast Prototyper / 快速迭代者**
```markdown
## Identity
You are Claw, a rapid-prototyping partner. Ship fast, iterate faster.
## Tone
- Casual and energetic. Keep explanations short.
- Bilingual: match whatever language the user writes.
```

**Chinese Tech Assistant / 中文技术助手**
```markdown
## 身份
你是 Claw，一个务实的技术搭档。用中文交流，代码注释用英文。
## 语气
- 简洁直接，不说废话。
- 技术术语保留英文原文（如 "scopeKey"、"JSON-RPC"）。
```

### Project Knowledge / 项目知识

Edit `.cursor/rules/agents.mdc` — add your project architecture.

编辑 `.cursor/rules/agents.mdc` — 填入你的项目架构。

Edit `.cursor/rules/tools.mdc` — add SDK gotchas and conventions.

编辑 `.cursor/rules/tools.mdc` — 填入工具的坑和约定。

### Long-Term Memory / 长期记忆

Edit `memory/MEMORY.md` with durable project knowledge:

编辑 `memory/MEMORY.md` 填入持久的项目知识：

```markdown
# Project Memory

## Architecture
- Next.js 14 App Router + Server Components
- Database: PostgreSQL via Prisma ORM
- Auth: NextAuth.js with GitHub OAuth

## Conventions
- All API routes in src/app/api/
- Use Zod for request validation
```

---

## Team Usage / 团队使用

### Share via Git / 通过 Git 共享

```bash
git add .cursor/rules/ .cursor/hooks/ .cursor/hooks.json memory/MEMORY.md
git commit -m "feat: add CursorClaw rules and memory"
git push
```

Team members who clone the repo automatically get all rules, hooks, and long-term memory.

团队成员 clone 后自动获得所有规则、hooks 和长期记忆。

### Personal Override / 个人覆盖

Team members can override `soul.mdc` without affecting others by creating a user-level rule:

团队成员可以通过用户级规则覆盖 `soul.mdc`，不影响其他人：

```bash
mkdir -p ~/.cursor/rules
cat > ~/.cursor/rules/soul.mdc << 'EOF'
---
description: My personal Claw persona
alwaysApply: true
---
# Soul
(Your personal style here / 你的个人风格)
EOF
```

---

## FAQ

### Hooks not firing? / Hooks 没有触发？

1. Ensure the workspace is trusted by Cursor / 确认工作区被 Cursor 信任
2. Check script permissions: `chmod +x .cursor/hooks/*.sh`
3. Verify `jq` is installed: `which jq`
4. Check Cursor's Output panel → "Hooks" channel / 查看 Cursor 的 Output 面板

### Memory files growing too large? / 记忆文件太大？

- Keep `MEMORY.md` under 200 lines — merge old entries / 保持 200 行以内
- Daily logs (`YYYY-MM-DD.md`) are gitignored — clean up periodically / 每日日志不入 git，定期清理
- `session-memory.sh` has an 8000-char truncation / 有 8000 字符截断保护

### Works with CLAUDE.md? / 能和 CLAUDE.md 共存？

Yes. Cursor reads both `.cursor/rules/*.mdc` and `CLAUDE.md`. No conflicts.

可以。Cursor 同时读取 `.cursor/rules/*.mdc` 和 `CLAUDE.md`，不冲突。

### Bridge sessions have memory? / Bridge 会话有记忆？

Yes. The `HookRunner` fires `sessionStart` hooks in ACP mode, injecting `memory/MEMORY.md` and daily logs as `additional_context`. Same data, same mechanism.

有。`HookRunner` 在 ACP 模式下触发 `sessionStart` hooks，将 `memory/MEMORY.md` 和每日日志注入为 `additional_context`。数据和机制与 IDE 一致。

### Telegram receiving duplicate messages? / Telegram 收到重复消息？

Make sure only one bot instance is running. Kill old processes before restarting:

确保只有一个 bot 实例在运行。重启前先杀旧进程：

```bash
ps aux | grep 'node.*telegram' | grep -v grep | awk '{print $2}' | xargs kill -9
sleep 1
npm run start:telegram
```

---

## Architecture Overview / 架构概览

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Cursor   │     │ Feishu   │     │ Telegram │
│ IDE      │     │ User     │     │ User     │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     │ (native)       │ (WebSocket)    │ (Polling)
     ▼                ▼                ▼
  .cursor/rules   ChannelAdapter  ChannelAdapter
  .cursor/hooks      │                │
  memory/            └───────┬────────┘
     │                       │
     │                BridgeController
     │                       │
     │              ┌────────┴────────┐
     │              ▼                 ▼
     │         HookRunner       SessionManager
     │         (17/18 hooks)    (scope isolation)
     │              │                 │
     └──────────────┴────────┬────────┘
                             ▼
                      agent acp (CLI)
                    JSON-RPC over stdio
```

Both IDE and Bridge read the same rules and memory files. The `HookRunner` ensures hooks work identically in both paths.

IDE 和 Bridge 读取相同的规则和记忆文件。`HookRunner` 确保 hooks 在两条路径上行为一致。

---

## Links / 相关链接

- [Hooks Compatibility / Hooks 兼容文档](hooks-bridge.md)
- [Memory System Design / 记忆系统设计](cursorclaw-memory-design.md)
- [Feature Showcase / 功能展示](cursorclaw-bridge-share.md)
- [Cursor ACP Protocol](https://cursor.com/docs/cli/acp)
- [Cursor Hooks](https://cursor.com/docs/hooks)
- [Cursor Rules](https://cursor.com/docs/rules)
- [ElevenLabs API](https://elevenlabs.io/docs)
