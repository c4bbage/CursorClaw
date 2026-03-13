# CursorClaw Bridge

**Run Cursor Agent from Feishu and Telegram.** Send a chat message, get code edits back — with streaming, voice, scheduled tasks, and cross-session memory.

**通过飞书和 Telegram 使用 Cursor Agent。** 发一条消息就能获得代码编辑——支持流式回复、语音、定时任务和跨会话记忆。

CursorClaw Bridge connects messaging platforms to [Cursor's ACP protocol](https://cursor.com/docs/cli/acp) (Agent Client Protocol), giving you full AI coding capabilities from any chat window. Your `.cursor/rules`, Skills, MCP servers, and Hooks all work — no IDE required.

CursorClaw Bridge 将即时通讯平台接入 [Cursor ACP 协议](https://cursor.com/docs/cli/acp)，让你在任何聊天窗口都能使用完整的 AI 编程能力。你的 `.cursor/rules`、Skills、MCP 和 Hooks 全部可用——不需要打开 IDE。

---

## Philosophy / 理念

We live in an era of incredibly powerful AI agents — Cursor, Claude Code, Codex, Gemini CLI, and more arriving every month. Each has unique strengths: deep codebase understanding, long-context reasoning, multimodal input, or blazing speed. The smart move isn't to pick one and ignore the rest — it's to **build bridges that let you harness all of them**.

CursorClaw is exactly that kind of bridge. Instead of being locked into a single IDE window, you get Cursor's full agent capabilities wherever you are — on your phone via Telegram, in a team chat on Feishu, or through a scheduled cron job at 3 AM. The Rules, Hooks, and Memory you invest in aren't wasted on one tool; they travel with you across interfaces.

The best developers in the AI era won't be the ones who master one agent. They'll be the ones who **compose agents into workflows** — letting each do what it does best, while keeping a unified memory and rule system that makes the whole greater than the sum of its parts.

我们正处在 AI Agent 爆发的时代——Cursor、Claude Code、Codex、Gemini CLI，每个月都有新的强大工具出现。每个都有独特优势：深度代码理解、长上下文推理、多模态输入、极致速度。聪明的做法不是选一个然后忽略其他，而是**搭建桥梁，借用所有工具的能力**。

CursorClaw 就是这样一座桥。不再局限于 IDE 窗口，你可以在手机上通过 Telegram、在团队飞书群里、甚至通过凌晨三点的定时任务来使用 Cursor 的全部 Agent 能力。你在 Rules、Hooks 和 Memory 上的投入不会被锁死在某一个工具里，它们跟着你跨越所有界面。

AI 时代最强的开发者，不是精通某一个 Agent 的人，而是**善于把多个 Agent 编排成工作流**的人——让每个工具做它最擅长的事，同时保持统一的记忆和规则系统，让整体大于部分之和。

---

## Features / 功能

| Feature / 功能 | Description / 说明 |
|---|---|
| **Multi-Channel / 多渠道** | Feishu (Lark) and Telegram with unified interface / 飞书和 Telegram 统一接口 |
| **Streaming / 流式回复** | Real-time message updates as the agent responds / Agent 生成时实时更新消息 |
| **Voice I/O / 语音交互** | STT input + TTS replies via [ElevenLabs](https://elevenlabs.io) / 语音输入转写 + 语音回复 |
| **Hooks Compatible / Hooks 兼容** | 17/18 Cursor hook events in ACP mode ([docs](docs/hooks-bridge.md)) / 支持 17/18 个 hooks 事件 |
| **Rules & Skills / 规则和技能** | `.cursor/rules/*.mdc`, `AGENTS.md`, and global Skills auto-load / 自动加载规则和技能 |
| **Session Isolation / 会话隔离** | Per-user per-chat via `channel:conversation:user` scope keys / 按用户按会话隔离 |
| **Scheduled Tasks / 定时任务** | Agent creates cron jobs that proactively push results / Agent 可创建定时推送任务 |
| **Cross-Session Memory / 跨会话记忆** | Hook-powered memory from `memory/` files / 基于 hooks 的记忆注入系统 |
| **Access Control / 权限控制** | User/chat allowlists via environment variables / 环境变量配置白名单 |
| **Bot Commands / 命令菜单** | `/help`, `/cancel`, `/status`, `/memory`, `/clear`, `/tasks`, `/voice` |

---

## Quick Start / 快速开始

### Prerequisites / 前置要求

- [Cursor CLI](https://cursor.com/docs/cli/using) installed and authenticated (`agent login`) / 已安装并登录
- Node.js >= 18
- `jq` installed (for hooks) / 已安装 `jq`（hooks 依赖）
- A Feishu bot or Telegram bot token / 飞书机器人或 Telegram Bot Token

### Install / 安装

```bash
git clone https://github.com/c4bbage/CursorClaw.git
cd CursorClaw

# Full setup (rules + hooks + memory + npm install + .env)
# 完整安装（规则 + hooks + 记忆 + npm 依赖 + .env）
bash setup-claw.sh --bridge
```

Or manually / 或者手动安装：

```bash
npm install
cp .env.example .env
# Edit .env with your credentials / 编辑 .env 填入凭据
```

### Configure `.env` / 配置环境变量

```bash
# ── Feishu (Lark) / 飞书 ────────────────────────
# Create a bot at https://open.feishu.cn/app
# 在飞书开放平台创建机器人
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
FEISHU_ALLOWED_USERS=              # comma-separated open_ids (empty = all) / 逗号分隔
FEISHU_ALLOWED_CHATS=

# ── Telegram ────────────────────────────────────
# Get token from @BotFather / 从 @BotFather 获取
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_ALLOWED_USERS=123456789   # comma-separated user IDs / 逗号分隔
TELEGRAM_ALLOWED_CHATS=

# ── ElevenLabs (optional / 可选) ────────────────
ELEVENLABS_API_KEY=your_key
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
```

### Run / 运行

```bash
# Feishu bridge / 飞书
npm start

# Telegram bridge
npm run start:telegram

# Both (separate terminals) / 同时运行
npm start & npm run start:telegram
```

---

## Architecture / 架构

```
Feishu / Telegram
      │
      ▼
ChannelAdapter          ← auth, normalize, stream handles, voice
      │                    授权、标准化、流式句柄、语音
      ▼
BridgeController        ← routing, bot commands, TTS, app commands
      │                    路由、命令、TTS、应用命令
  ┌───┴───┐
  ▼       ▼
Session  HookRunner     ← .cursor/hooks.json (17/18 events)
Manager
  │
  ▼
agent acp (child process / 子进程)
  │
  ├── .cursor/rules/*.mdc     (auto-loaded / 自动加载)
  ├── AGENTS.md / CLAUDE.md   (auto-loaded / 自动加载)
  ├── .cursor/mcp.json        (MCP tools)
  └── ~/.cursor/skills/       (global skills)
```

Each user session spawns an independent `agent acp` process communicating over stdio JSON-RPC. Sessions are scoped by `channel:conversation:user` so multiple users never share context.

每个用户会话启动独立的 `agent acp` 进程，通过 stdio JSON-RPC 通信。会话按 `channel:conversation:user` 隔离，多用户互不干扰。

---

## Bot Commands / 命令菜单

| Command / 命令 | Action / 说明 |
|---|---|
| `/help` | Show commands / 显示命令列表 |
| `/cancel` | Cancel current task / 取消当前任务 |
| `/status` | Session info / 会话状态 |
| `/memory` | View project memory / 查看项目记忆 |
| `/clear` | Reset session / 重置会话 |
| `/tasks` | List scheduled tasks / 查看定时任务 |
| `/voice` | Toggle voice reply / 开关语音回复 |

---

## Voice / 语音

Requires [ElevenLabs](https://elevenlabs.io) API key. / 需要 ElevenLabs API Key。

**Input (STT) / 语音输入：** Send a voice message — auto-transcribed and processed. / 发送语音消息，自动转写后处理。

- Telegram: OGG → ElevenLabs STT
- Feishu: built-in STT first, falls back to ElevenLabs / 先用内置 STT，失败降级到 ElevenLabs

**Output (TTS) / 语音输出：** Send `/voice` to enable. Every text reply gets an audio version. / 发 `/voice` 开启，回复附带语音。

---

## Hooks

CursorClaw Bridge reads `.cursor/hooks.json` and fires hooks at equivalent ACP lifecycle points. Your existing hook scripts work without modification.

Bridge 读取 `.cursor/hooks.json` 并在 ACP 生命周期的等效节点触发 hooks。已有的 hook 脚本无需修改即可工作。

**17/18 agent hook events supported.** Only `preCompact` is unsupported (ACP doesn't expose context compaction).

**支持 17/18 个 agent hook 事件。** 仅 `preCompact` 不支持（ACP 未暴露上下文压缩）。

See [docs/hooks-bridge.md](docs/hooks-bridge.md) for the alignment matrix and authoring guide. Reference config: `.cursor/hooks.json.example`.

详见 [docs/hooks-bridge.md](docs/hooks-bridge.md)。参考配置：`.cursor/hooks.json.example`。

---

## Memory System / 记忆系统

```
memory/
├── MEMORY.md              # Long-term knowledge (git-tracked) / 长期知识（入 git）
└── 2026-03-13.md          # Daily session log (auto) / 每日日志（自动）

.cursor/
├── rules/
│   ├── agents.mdc         # Project context / 项目上下文
│   ├── soul.mdc           # Agent persona / Agent 人格
│   ├── tools.mdc          # Tool guide / 工具备忘
│   └── memory-protocol.mdc # Memory protocol / 记忆协议
├── hooks.json             # Hook config
└── hooks/
    ├── session-memory.sh   # Injects memory / 注入记忆
    ├── session-summary.sh  # Writes daily log / 写入日志
    └── log-event.sh        # Event logger / 事件记录
```

At each session start, `session-memory.sh` injects `MEMORY.md` and recent daily logs as `additional_context`.

每次会话启动时，`session-memory.sh` 将 `MEMORY.md` 和最近日志注入为 `additional_context`。

See [docs/cursorclaw-memory-design.md](docs/cursorclaw-memory-design.md).

---

## Access Control / 权限控制

By default the bot responds to everyone. Restrict with environment variables:

默认响应所有用户。通过环境变量限制：

```bash
TELEGRAM_ALLOWED_USERS=5777935516,987654321
TELEGRAM_ALLOWED_CHATS=-1001234567890
FEISHU_ALLOWED_USERS=ou_xxxxxxxxxx
```

Unauthorized users receive a rejection message showing their ID (easy to add to allowlist).

未授权用户会收到拒绝消息，其中包含他们的 ID（方便加白）。

---

## Project Structure / 项目结构

```
├── feishu-cursor.js            # Feishu entry point / 飞书入口
├── telegram.js                 # Telegram entry point / Telegram 入口
├── src/
│   ├── bridge-controller.js    # Message routing, commands, TTS / 路由、命令、TTS
│   ├── cursor-bridge.js        # ACP JSON-RPC client + hooks / ACP 客户端
│   ├── cursor-session-manager.js # Session lifecycle / 会话生命周期
│   ├── hook-runner.js          # hooks.json executor / hooks 执行器
│   ├── elevenlabs.js           # ElevenLabs TTS + STT
│   ├── task-scheduler.js       # Cron scheduler / 定时调度
│   ├── app-commands.js         # Parse structured commands / 解析结构化命令
│   ├── app-command-executor.js # Execute app commands / 执行应用命令
│   ├── cursor-events.js        # Format extension events / 格式化事件
│   ├── channels/
│   │   └── channel-adapter.js  # Base adapter (auth, normalize) / 基础适配器
│   └── adapters/
│       ├── feishu.js           # Feishu adapter / 飞书适配器
│       └── telegram.js         # Telegram adapter / Telegram 适配器
├── .cursor/
│   ├── rules/*.mdc             # Agent rules / Agent 规则
│   ├── hooks.json              # Hook config
│   ├── hooks.json.example      # Reference config / 参考配置
│   └── hooks/*.sh              # Hook scripts
├── memory/
│   └── MEMORY.md               # Long-term memory / 长期记忆
├── docs/                       # Documentation / 文档
├── test/                       # Test suite / 测试
├── setup-claw.sh               # Bootstrap script / 安装脚本
├── .env.example                # Env template / 环境变量模板
└── package.json
```

---

## Testing / 测试

```bash
npm test
```

---

## Development / 开发

```bash
# Feishu with auto-reload / 飞书（自动重载）
npm run dev

# Telegram with auto-reload / Telegram（自动重载）
npm run dev:telegram
```

---

## Documentation / 文档

| Document / 文档 | Description / 说明 |
|---|---|
| [Quickstart / 快速上手](docs/cursorclaw-quickstart.md) | Installation and customization / 安装和定制指南 |
| [Hooks Compatibility / Hooks 兼容](docs/hooks-bridge.md) | Hook alignment matrix and authoring / Hooks 对齐矩阵和编写指南 |
| [Memory Design / 记忆设计](docs/cursorclaw-memory-design.md) | Memory system architecture / 记忆系统架构 |
| [Feature Showcase / 功能展示](docs/cursorclaw-bridge-share.md) | Technical deep-dive / 技术详解 |

---

## License

MIT

---

## Links / 链接

- [Cursor ACP Protocol](https://cursor.com/docs/cli/acp)
- [Cursor Rules](https://cursor.com/docs/rules)
- [Cursor Hooks](https://cursor.com/docs/hooks)
- [Agent Client Protocol](https://agentclientprotocol.com)
- [ElevenLabs API](https://elevenlabs.io/docs)
