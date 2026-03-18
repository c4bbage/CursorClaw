# OpenClaw vs CursorClaw — 完整对比分析

> 基于 OpenClaw v2026.3.13 (2026-03-13 release) 与 CursorClaw 当前版本
> 分析日期：2026-03-18 (会话中误标为 3/16)

---

## 一、OpenClaw 架构总览

OpenClaw 已从早期的"聊天机器人"进化为一个完整的 AI Agent 操作系统：

```
                        ┌─────────────────────┐
                        │   Gateway (Node 24)  │
                        │   单进程多通道路由     │
                        └──────────┬──────────┘
          ┌────────┬───────┬───────┼───────┬──────────┬─────────┐
       WhatsApp  Telegram Discord iMessage Mattermost  Slack   WebChat
                                                      (plugin)
          └────────┴───────┴───────┼───────┴──────────┴─────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                Pi(内置Agent)  ACP Agent     Sub-Agent
                (嵌入式SDK)   (Cursor/Claude  (本地spawn)
                              Code/Codex/
                              Gemini CLI)
```

**关键变化**：Legacy Claude、Codex、Gemini、Opencode 路径已全部移除，Pi 是唯一的内置 coding agent 路径。外部 agent（Cursor/Claude Code/Codex 等）统一走 ACP 协议。

---

## 二、OpenClaw 核心能力详解

### 2.1 消息通道（10+）

| 通道 | 集成方式 | 状态 |
|------|---------|------|
| WhatsApp | WhatsApp Web (Baileys) | 官方核心 |
| Telegram | grammY | 官方核心 |
| Discord | discord.js | 官方核心 |
| iMessage | 本地 imsg CLI (macOS) | 官方核心 |
| Mattermost | Plugin 扩展 | 插件 |
| Slack | 官方集成 | 官方核心 |
| Signal | 社区插件 | 插件 |
| 飞书(Feishu) | 社区插件 | 插件 |
| Zalo | 社区插件 | 插件 |
| WebChat | 内置 Control UI | 官方核心 |

### 2.2 Agent 引擎

**Pi 嵌入式 SDK（主路径）**：
- 直接 `import { createAgentSession }` 嵌入 Agent 运行时
- 不走 subprocess + JSON-RPC，而是进程内调用
- 完整控制 session 生命周期、tool 注入、system prompt 定制
- 多账号 auth profile 轮换 + failover
- 依赖包：`@mariozechner/pi-agent-core@0.49.3`, `pi-ai@0.49.3`, `pi-coding-agent@0.49.3`

**ACP 外部代理**：
- 支持 Cursor、Claude Code、Codex、OpenCode、Gemini CLI
- 通过 `acpx` backend plugin 统一管理
- `/acp spawn codex --mode persistent --thread auto` 按需启动
- Thread-bound sessions：ACP session 可绑定到 Discord thread / Telegram topic
- 支持 `persistent` 和 `oneshot` 两种模式

### 2.3 模型提供商（30+）

Anthropic, OpenAI, Google/Gemini, Amazon Bedrock, Ollama, Qwen, Moonshot, MiniMax,
Mistral, NVIDIA, OpenRouter, vLLM, Together, Hugging Face, Cloudflare AI Gateway,
Vercel AI Gateway, Venice AI, LiteLLM, GitHub Copilot, Xiaomi MiMo, Z.AI...

- 支持 subscription auth (Anthropic/OpenAI via OAuth)
- 多账号 auth profile 轮换 + failover
- provider-specific tool policy

### 2.4 记忆系统

| 层级 | 实现 |
|------|------|
| 文件层 | `MEMORY.md` (长期) + `memory/YYYY-MM-DD.md` (每日) |
| 搜索层 | 向量语义搜索 (BM25 + vector hybrid) |
| Embedding | OpenAI / Gemini / Voyage / Mistral / Ollama / 本地 GGUF |
| 工具 | `memory_search` (语义召回) + `memory_get` (精确读取) |
| 自动化 | compaction 前自动 flush 记忆 |
| 实验后端 | QMD (BM25 + vectors + reranking 本地搜索) |
| 高级特性 | MMR re-ranking、temporal decay、embedding cache、citation |

### 2.5 多 Agent 路由

- 每个 Agent 独立的 workspace / agentDir / session store / auth profiles
- Binding-based 路由：`peer` > `parentPeer` > `guildId+roles` > `accountId` > channel > default
- 支持一个 WhatsApp 号码按 DM sender 路由到不同 Agent
- `openclaw agents add work` 一键创建新 Agent
- Agent 间 session 完全隔离

### 2.6 工具系统（50+）

**内置工具**：
- `exec` / `process` — Shell 命令执行 + 后台进程管理
- `read` / `write` / `edit` / `apply_patch` — 文件操作
- `browser` — Playwright 浏览器控制 + Chrome DevTools MCP attach
- `canvas` — iOS/Android Canvas 画布
- `web_search` / `web_fetch` — 网页搜索和抓取
- `image` / `image_generate` / `pdf` — 媒体处理
- `message` — 跨通道消息发送
- `cron` — 定时任务
- `gateway` — Gateway 管理
- `sessions_*` — Session 管理
- `agents_list` — Agent 列表
- `memory_search` / `memory_get` — 记忆检索

**工具治理**：
- Tool profiles: `minimal` / `coding` / `messaging` / `full`
- Tool groups: `group:runtime`, `group:fs`, `group:web`, `group:ui`...
- Per-provider tool policy
- Per-agent tool override
- Tool-loop detection (genericRepeat / knownPollNoProgress / pingPong)

### 2.7 Skills 与插件

- 正式 Skills 框架 + slash commands (`/skill_name`)
- ClawHub 社区技能市场
- Plugin manifest 标准 + community plugins
- Plugin bundles（打包多个插件）
- 插件可注册 agent tools + CLI commands

### 2.8 自动化

- Cron jobs（定时任务）
- Webhooks（HTTP 回调触发）
- Gmail PubSub（邮件触发）
- Polls（轮询触发）
- Auth Monitoring（认证状态监控）
- Hooks（生命周期钩子）

### 2.9 移动端 & 语音

- iOS Node app：配对、Canvas、相机、录屏、GPS、语音
- Android Node app：Connect tab、chat、voice tab、Canvas/camera、通知、联系人/日历、运动、照片、SMS
- Talk Mode（实时语音对话）
- Voice Wake（语音唤醒）
- TTS（文字转语音）
- Deepgram 语音转写

### 2.10 Web UI

- Control UI（浏览器 Dashboard）：聊天、配置、session 管理、节点管理
- macOS 菜单栏 App

---

## 三、CursorClaw 架构

```
Feishu / Telegram
       │
       ▼
 ChannelAdapter          (feishu.js / telegram.js)
   │  emitMessage()
   ▼
 BridgeController        (bridge-controller.js)
   │  handleMessage()
   ▼
 CursorSessionManager    (cursor-session-manager.js)
   │  getSession() → prompt()
   ▼
 CursorBridge            (cursor-bridge.js)
   │  spawn('agent', ['acp'])
   ▼
 Cursor CLI  ←→  JSON-RPC 2.0 over stdio
```

### CursorClaw 核心能力

| 维度 | 能力 |
|------|------|
| 通道 | 飞书（原生SDK深度集成）、Telegram |
| Agent | Cursor ACP（唯一路径） |
| 模型 | 通过 Cursor 透传（用户无需配置 API key） |
| Session | 进程级隔离，每 scopeKey 一个 CursorBridge 子进程 |
| 记忆 | MEMORY.md + daily log（文件级读写，无向量搜索） |
| 工具 | 4 个 app-commands：schedule_task, list_tasks, cancel_task, send_file |
| 流式输出 | push/finalize 流式（Feishu reply→update, Telegram editMessageText） |
| Extension Events | cursor/ask_question, create_plan, update_todos, generate_image, task |
| Harness | rules(.mdc) + skills(.md) + hooks(.sh) + entropy GC |

---

## 四、能力对比矩阵

| 能力维度 | OpenClaw | CursorClaw | 差距评估 |
|---------|----------|------------|---------|
| **消息通道数量** | 10+ | 2 | 大 |
| **Agent 引擎** | Pi(嵌入式) + ACP多引擎 | Cursor ACP only | 大 |
| **ACP 外部 Agent** | Cursor/Claude Code/Codex/Gemini CLI | Cursor only | 中 |
| **模型提供商** | 30+ (直接API) | Cursor 透传 | 大(但我们不需要自己管key) |
| **多 Agent 路由** | 完整(独立workspace/session) | 单 Agent(scopeKey隔离) | 大 |
| **记忆系统** | 文件 + 向量搜索 + QMD | 文件读写 only | 中 |
| **Session 管理** | 持久化JSONL + compaction | 进程级(重启丢失) | 大 |
| **Skills 系统** | 正式框架 + ClawHub | 手动 .md 文件 | 中 |
| **工具数量** | 50+ | 4 | 大 |
| **浏览器控制** | Playwright + Chrome MCP | 无 | 大 |
| **自动化** | Cron/Webhook/Gmail/Polls | 基础 cron | 中 |
| **移动端** | iOS + Android App | 无 | 大 |
| **语音** | Talk/Wake/TTS/转写 | 无 | 大 |
| **Web UI** | Control UI + macOS App | 无(纯CLI) | 大 |
| **沙箱** | 多层权限隔离 | 无 | 中 |
| **插件生态** | Plugin manifest + 社区 | 无 | 大 |
| **流式输出** | Block chunking + tag stripping | push/finalize | 小 |
| **安装体验** | `npm install -g` + `onboard` | 手动部署 | 中 |

---

## 五、CursorClaw 差异化优势

虽然整体规模差距大，但 CursorClaw 在以下维度有独特价值：

| 优势 | 说明 |
|------|------|
| **飞书深度集成** | 原生飞书 SDK，支持 post/card 消息、file_key 上传、流式更新。OpenClaw 飞书仅有社区插件 |
| **Cursor 专精优化** | 针对 Cursor ACP 的 extension events 全覆盖(ask_question, create_plan, update_todos, generate_image, task)，OpenClaw 走通用 ACP |
| **零 API Key 部署** | 利用 Cursor 订阅，用户不需要配置任何 AI 模型 API key |
| **轻量级** | 单文件入口，分钟级部署，不需要 onboard 流程 |
| **Harness 工程** | 完整的 rules + skills + hooks + entropy GC 自维护体系，对 Cursor 生态理解更深 |
| **内部专用** | 面向内部团队，可以做高度定制化，不需要考虑社区兼容性 |

---

## 六、差距分析与优先级

### 我们落后的关键维度（按优先级）

**P0 — 高价值、中等工作量：**

1. **多 Agent 支持**
   - OpenClaw 能同时调度 Cursor / Claude Code / Codex
   - 我们的 `CursorBridge` 可泛化为 `AgentBridge`，支持不同 ACP 后端
   - 预估工作量：2-3 天（协议层已兼容，主要是配置和路由）

2. **Session 持久化**
   - 当前重启丢失所有会话
   - OpenClaw 用 JSONL 持久化 + compaction
   - 预估工作量：3-5 天

**P1 — 中等价值、可渐进：**

3. **工具扩展机制**
   - 从硬编码 4 个 app-commands 到可插拔工具注册
   - 参考 OpenClaw 的 tool profiles + groups 设计
   - 预估工作量：2-3 天（框架），每个新工具 0.5-1 天

4. **记忆向量化**
   - 加一层 embedding 索引（可用 Ollama 本地模型）
   - 预估工作量：2-3 天

5. **更多通道**
   - Discord / WeChat 是下一个高价值通道
   - 有 ChannelAdapter 基类，新通道主要是实现适配器
   - 预估工作量：每个通道 2-3 天

**P2 — 低优先级（除非有明确需求）：**

6. 移动端 App — 工程量巨大，非核心路径
7. 语音 — 可通过 MCP 接入外部服务
8. Web UI — 可用 Telegram/飞书作为 UI，不急
9. 浏览器控制 — 可通过 MCP 接入
10. 插件生态 — 先把核心做好

---

## 七、战略建议

### 短期（1-2 周）

```
1. CursorBridge → AgentBridge 泛化
   - 支持 `cursor agent acp` 和 `claude` 两个后端
   - 配置化选择：per-scope 或 per-command 指定 agent

2. 扩展 app-commands → Tool Registry
   - 可插拔工具注册机制
   - 至少新增：web_search、exec、memory_search

3. Session 持久化 MVP
   - JSONL 格式存储会话历史
   - 重启后恢复
```

### 中期（1-2 月）

```
4. 记忆向量化
   - Ollama 本地 embedding
   - BM25 + vector hybrid search

5. Discord 通道
   - 复用 ChannelAdapter 基类
   - Thread binding 支持

6. 参考 OpenClaw Pi SDK 模式
   - 评估是否从 subprocess 迁移到嵌入式
   - 可能需要等 Cursor SDK 开放
```

### 长期方向

```
- 定位不是做"小号 OpenClaw"，而是做"最懂飞书 + Cursor 的 Agent Bridge"
- 飞书生态深耕：Interactive Card、审批流、日历集成
- Cursor/Claude 双引擎专精：比 OpenClaw 更深的 extension events 支持
- Harness Engineering 持续进化：让 Agent 能自我维护和优化
```

---

## 八、一句话总结

> OpenClaw 是一个面向全球开发者的通用 Agent OS（319k stars），覆盖 10+ 通道、50+ 工具、30+ 模型。
> CursorClaw 是一个面向内部团队的专精 Agent Bridge，在飞书集成和 Cursor 深度支持上有独特优势。
> 
> **不要追全面，要追深度。** 短期把多 Agent + Session 持久化 + 工具扩展做好，中期做记忆向量化，长期定位"最懂飞书 + Cursor 的 Agent Bridge"。
