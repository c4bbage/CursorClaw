# Why CursorClaw: Low-Cost, Inheritable, Secure AI Agent Bridge

# 为什么选 CursorClaw：低成本、可继承、安全的 AI Agent 桥接

> The 2026 AI agent landscape is crowded — OpenClaw, NanoBot, Claude Code, Codex CLI, Gemini CLI, and dozens more. Each builds its own config format, its own memory system, its own plugin ecosystem. Every time you switch tools, you start from zero.
>
> CursorClaw takes a different approach: **don't build a new agent — bridge to the one you already invested in.**

> 2026 年 AI Agent 生态百花齐放——OpenClaw、NanoBot、Claude Code、Codex CLI、Gemini CLI，还有几十个。每个都有自己的配置格式、记忆系统、插件生态。每换一个工具，你就从零开始。
>
> CursorClaw 的思路不同：**不造新 Agent——桥接你已经投入的那个。**

---

## The Real Cost of AI Agents / AI Agent 的真实成本

Everyone talks about API costs. Few talk about the **maintenance tax**:

大家都在算 API 费用，很少有人算**维护税**：

| Hidden Cost / 隐性成本 | What it looks like / 表现 |
|---|---|
| **Config drift** / 配置漂移 | Rules in Cursor, prompts in Claude, workflows in Copilot — none in sync / 规则分散在各个工具，互不同步 |
| **Memory silos** / 记忆孤岛 | Each agent learns independently; switch tools, lose context / 每个 Agent 独立学习，切换即失忆 |
| **Plugin duplication** / 插件重复 | Same MCP server configured 3 times for 3 tools / 同一个 MCP 服务在 3 个工具里配置 3 遍 |
| **Onboarding** / 新人上手 | "Read AGENTS.md, also .claude, also .cursorrules, also..." / 新人要读 N 份不同的配置文件 |
| **Security surface** / 安全面 | Each agent runtime = another attack surface to audit / 每个 Agent 运行时 = 多一个审计对象 |

CursorClaw eliminates most of these by **reusing Cursor's native config as the single source of truth**.

CursorClaw 通过**复用 Cursor 的原生配置作为唯一事实来源**来消除这些问题。

---

## Comparison: CursorClaw vs OpenClaw vs NanoBot

## 对比：CursorClaw vs OpenClaw vs NanoBot

| Dimension / 维度 | **CursorClaw** | **OpenClaw** | **NanoBot** |
|---|---|---|---|
| **What it is / 定位** | Bridge to Cursor Agent / Cursor Agent 的桥接层 | Full agent platform / 完整 Agent 平台 | Lightweight agent / 轻量 Agent |
| **Codebase / 代码量** | ~2K lines JS | 430K+ lines TS | ~4K lines Python |
| **Config format / 配置格式** | `.cursor/rules/*.mdc` + `hooks.json` (Cursor native) | `AGENTS.md` + `.agents.local.md` | `MEMORY.md` + YAML config |
| **LLM backend / 模型后端** | Cursor's model routing (uses your Cursor subscription) | Self-managed (API keys per provider) | 11+ providers via API keys |
| **Messaging / 消息平台** | Feishu + Telegram (extensible) | None (CLI only) | 9 platforms |
| **Memory system / 记忆** | `memory/` + Hooks injection | `AGENTS.md` + scratchpad | `MEMORY.md` + daily notes |
| **Tool ecosystem / 工具生态** | Cursor's full toolset (Read, Write, Shell, Grep, MCP...) | OpenClaw tools + MCP | File ops, shell, web, MCP |
| **Hooks / 钩子** | 17/18 Cursor hook events | Custom hooks | None |
| **Security model / 安全模型** | Cursor's sandboxing + env-based allowlist | Container isolation (NanoClaw) | Process-level |
| **Cost to user / 用户成本** | Cursor subscription ($20/mo) | API costs per provider | API costs per provider |
| **Config migration / 配置迁移** | Zero — uses existing `.cursor/` | Must write `AGENTS.md` from scratch | Must write config from scratch |

### Key Insight / 核心观点

**NanoBot and OpenClaw are agents. CursorClaw is a bridge.**

**NanoBot 和 OpenClaw 是 Agent。CursorClaw 是桥。**

This means:

- If you already use Cursor → CursorClaw has **zero config cost**. Your existing rules, hooks, skills, and MCP servers just work.
- If you don't use Cursor → CursorClaw isn't for you. Use NanoBot or OpenClaw directly.

这意味着：

- 如果你已经用 Cursor → CursorClaw **零配置成本**。现有的 rules、hooks、skills、MCP 直接生效。
- 如果你不用 Cursor → CursorClaw 不适合你。直接用 NanoBot 或 OpenClaw。

---

## Workspace Inheritance / 工作站继承

The hardest problem in AI-assisted development isn't making the agent smart — it's making it **remember** and **share** what it learned.

AI 辅助开发最难的不是让 Agent 变聪明——而是让它**记住**和**共享**学到的东西。

### The Inheritance Chain / 继承链

```
~/.cursor/rules/          ← User-level: your personal style (follows you everywhere)
                              用户级：你的个人风格（跟着你走）
        ↓ (merged)
.cursor/rules/*.mdc       ← Project-level: team knowledge (committed to git)
                              项目级：团队知识（提交到 git）
        ↓ (merged)
memory/MEMORY.md          ← Long-term memory: architecture decisions, conventions
                              长期记忆：架构决策、约定
        ↓ (injected by hooks)
memory/YYYY-MM-DD.md      ← Daily log: session-specific learnings (auto-generated)
                              每日日志：会话级学习（自动生成）
```

**What this means in practice / 实际效果：**

1. **New team member joins** → `git clone` → all project rules + memory + hooks ready. Zero setup.

   **新人入职** → `git clone` → 所有项目规则 + 记忆 + hooks 就绪。零配置。

2. **Switch machines** → your `~/.cursor/rules/soul.mdc` carries your personal style. Project rules come from git.

   **换电脑** → `~/.cursor/rules/soul.mdc` 带着你的个人风格。项目规则从 git 来。

3. **Use from phone** → CursorClaw Bridge loads the exact same rules and memory. No separate config needed.

   **手机使用** → CursorClaw Bridge 加载完全相同的规则和记忆。不需要单独配置。

### Comparison with OpenClaw / 与 OpenClaw 对比

| | CursorClaw | OpenClaw |
|---|---|---|
| **Inheritance** / 继承 | User → Project → Memory (3 layers, auto-merged) | `AGENTS.md` + `.agents.local.md` (2 files) |
| **Sharing** / 共享 | `.cursor/rules/` committed to git | `AGENTS.md` committed to git |
| **Personal override** / 个人覆盖 | `~/.cursor/rules/` (never conflicts with team) | `.agents.local.md` (gitignored) |
| **Auto-injection** / 自动注入 | Hooks inject memory at session start | Must manually read at session start |
| **Bridge compatibility** / 桥接兼容 | Same config for IDE and Bridge | CLI only |

---

## Security / 安全

### Access Control / 访问控制

```bash
# Only these users can talk to your bot / 只有这些用户可以和 Bot 对话
TELEGRAM_ALLOWED_USERS=5777935516,987654321
FEISHU_ALLOWED_USERS=ou_xxxxxxxxxx

# Only these groups / 只有这些群组
TELEGRAM_ALLOWED_CHATS=-1001234567890
```

- Empty allowlist = allow all (for development) / 空白名单 = 允许所有人（开发阶段）
- Unauthorized users get a rejection with their ID (easy to add) / 未授权用户收到拒绝消息并显示 ID
- Authorization happens at the adapter layer, before any ACP session is created / 鉴权在适配器层，在创建 ACP 会话之前

### Session Isolation / 会话隔离

Each conversation gets an isolated ACP process, scoped by `channel:conversation:user`:

每个会话获得独立的 ACP 进程，按 `channel:conversation:user` 隔离：

```
telegram:chat_123:user_456  →  agent acp (process A)
telegram:chat_123:user_789  →  agent acp (process B)
feishu:chat_abc:user_xyz    →  agent acp (process C)
```

- No shared state between users / 用户间无共享状态
- No shared state between channels / 渠道间无共享状态
- Each process runs with the project's filesystem permissions / 每个进程以项目文件系统权限运行

### What CursorClaw Does NOT Do / CursorClaw 不做的事

- Does not store messages or conversations (stateless bridge) / 不存储消息或对话（无状态桥接）
- Does not proxy API keys (Cursor CLI handles auth) / 不代理 API Key（Cursor CLI 自行认证）
- Does not modify Cursor's security model / 不修改 Cursor 的安全模型
- `.env` is gitignored; `.env.example` has no secrets / `.env` 不入 git；`.env.example` 无敏感信息

---

## Integrating Other Clients / 接入其他客户端

CursorClaw's adapter pattern makes it straightforward to add new messaging platforms.

CursorClaw 的适配器模式让接入新消息平台变得简单。

### Architecture / 架构

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Telegram    │  │   Feishu    │  │   Slack ?   │  │  Discord ?  │
│  Adapter     │  │   Adapter   │  │   Adapter   │  │   Adapter   │
└──────┬───────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                 │                │                 │
       └────────┬────────┴────────┬───────┘─────────┬──────┘
                │                                   │
         ChannelAdapter (base)              BridgeController
                │                                   │
         ┌──────┴──────┐                    ┌───────┴───────┐
         │ normalize   │                    │ route message │
         │ authorize   │                    │ bot commands  │
         │ stream      │                    │ TTS / STT     │
         │ voice       │                    │ app commands  │
         └─────────────┘                    └───────────────┘
```

### To Add a New Client / 接入新客户端

Extend `ChannelAdapter` and implement 5 methods:

继承 `ChannelAdapter` 并实现 5 个方法：

```javascript
import { ChannelAdapter } from '../channels/channel-adapter.js';

export class SlackAdapter extends ChannelAdapter {
  constructor(options) {
    super('slack', options);
  }

  // Required: start listening for messages
  async start() { /* set up Slack event listener */ }

  // Required: send a new message, return a stream handle
  async sendReply(target, text) { /* post to Slack channel */ }

  // Required: create a handle for streaming updates
  createStreamHandle(target) {
    return {
      update: async (text) => { /* edit existing message */ },
      finalize: async (text) => { /* final update */ }
    };
  }

  // Optional: resolve images/voice from message
  async resolvePromptInput(message) {
    return { promptText: message.text, promptOptions: {} };
  }

  // Optional: send voice message
  async sendAudio(target, buffer, options) { /* upload audio */ }
}
```

Then wire it up in an entry point:

然后在入口文件中连接：

```javascript
const adapter = new SlackAdapter({ token: process.env.SLACK_TOKEN });
const sessions = new CursorSessionManager({ cwd: process.cwd() });
const controller = new BridgeController({ channelAdapter: adapter, cursorSessions: sessions });
adapter.on('message', msg => controller.handleMessage(msg));
await adapter.start();
```

**That's it.** The `BridgeController` handles everything else — routing, session lifecycle, hooks, commands, TTS.

**就这些。** `BridgeController` 处理其余一切——路由、会话生命周期、hooks、命令、TTS。

### Potential Integrations / 潜在接入方向

| Platform | Effort | Notes |
|---|---|---|
| **Slack** | Medium | Rich message API, threading, file uploads |
| **Discord** | Medium | Slash commands, embeds, voice channels |
| **WeChat Work / 企业微信** | Medium | Similar to Feishu pattern |
| **CLI / Terminal** | Low | Stdin/stdout adapter, useful for scripting |
| **HTTP API** | Low | REST endpoint, enables any client to connect |
| **GitHub Issues/PR** | Medium | Comment-driven agent, CI integration |
| **Email** | Low | IMAP/SMTP adapter for async workflows |

---

## Adding Cursor to Your Workflow / 将 Cursor 加入你的工作流

CursorClaw isn't just a chat bot — it's a way to embed Cursor Agent into existing processes.

CursorClaw 不只是一个聊天机器人——它是把 Cursor Agent 嵌入现有流程的方式。

### Scenario 1: Morning Briefing / 场景 1：晨会简报

```
Cron (8:00 AM) → CursorClaw scheduled task
  → Agent reads git log, open PRs, failing tests
  → Pushes summary to team Feishu group
```

Set up with a single message: "每天早上 8 点给我推送项目状态，包括昨天的 git 提交、未合并的 PR 和失败的测试"

### Scenario 2: On-Call Alert Handler / 场景 2：值班告警处理

```
Alert (PagerDuty/Grafana webhook) → Telegram message
  → CursorClaw receives alert text
  → Agent searches codebase for relevant error handlers
  → Suggests fix or creates a draft PR
```

### Scenario 3: Code Review from Phone / 场景 3：手机上 Code Review

```
You (on train): "review the latest PR on main branch, focus on security"
  → CursorClaw relays to Cursor Agent
  → Agent reads diff, checks for injection, auth issues
  → Streams review comments back to Telegram
```

### Scenario 4: Documentation Auto-Update / 场景 4：文档自动更新

```
Cron (weekly) → CursorClaw scheduled task
  → Agent reads recent changes, updates API docs
  → Commits and pushes
  → Sends summary to Feishu
```

### Scenario 5: Multi-Agent Pipeline / 场景 5：多 Agent 流水线

```
Claude Code (writes the code)
  → git push
  → CursorClaw cron detects new commits
  → Cursor Agent (via Bridge) runs tests, reviews, and reports
  → Results pushed to Telegram
```

The key insight: **Cursor Agent already has all the tools** — file read/write, shell, grep, MCP. CursorClaw just gives it a new front door.

核心洞察：**Cursor Agent 已经拥有所有工具**——文件读写、终端、搜索、MCP。CursorClaw 只是给它开了一扇新的门。

---

## When NOT to Use CursorClaw / 什么时候不该用 CursorClaw

Be honest about trade-offs:

坦诚面对取舍：

| Situation / 场景 | Better choice / 更好的选择 |
|---|---|
| You don't use Cursor / 你不用 Cursor | NanoBot (lightweight, multi-LLM) or OpenClaw |
| You need 9+ messaging platforms / 需要 9+ 消息平台 | NanoBot (supports 9 out of box) |
| You want container-level isolation / 需要容器级隔离 | NanoClaw |
| You want full self-hosted LLM / 完全自托管模型 | NanoBot + vLLM or Ollama |
| Your team uses different IDEs / 团队用不同 IDE | OpenClaw (IDE-agnostic) |

**CursorClaw is the right choice when:** you're already invested in Cursor's ecosystem (rules, hooks, skills, MCP, subscription) and want to **extend** that investment to messaging platforms, automation workflows, and mobile access — without maintaining a separate agent config.

**CursorClaw 适合的场景：** 你已经投入了 Cursor 生态（rules、hooks、skills、MCP、订阅），想把这些投入**延伸**到消息平台、自动化工作流和移动端——而不需要维护一套独立的 Agent 配置。

---

## Summary / 总结

| | Build a new agent / 造一个新 Agent | Bridge to Cursor / 桥接到 Cursor |
|---|---|---|
| **Config cost** / 配置成本 | High — new format, new rules, new plugins | Zero — reuse `.cursor/` |
| **Memory** / 记忆 | Isolated per tool | Shared via `memory/` + hooks |
| **Tools** / 工具 | Must implement or integrate | Cursor's full toolset |
| **Security** / 安全 | Must build from scratch | Inherit Cursor's model + add allowlist |
| **Maintenance** / 维护 | Another system to update | Thin bridge layer, Cursor does the heavy lifting |
| **Portability** / 可移植性 | Works everywhere, needs setup everywhere | Works wherever Cursor CLI runs |

**The cheapest agent to maintain is the one you don't have to build.**

**维护成本最低的 Agent，是你不需要自己造的那一个。**

---

## Get Started / 开始使用

```bash
git clone https://github.com/c4bbage/CursorClaw.git
cd CursorClaw
bash setup-claw.sh --bridge
# Edit .env → npm start
```

- [GitHub](https://github.com/c4bbage/CursorClaw)
- [Quickstart Guide / 快速上手](cursorclaw-quickstart.md)
- [Hooks Compatibility / Hooks 兼容](hooks-bridge.md)
- [Feature Showcase / 功能展示](cursorclaw-bridge-share.md)
