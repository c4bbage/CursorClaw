# 为什么选 CursorClaw：低成本、可继承、安全的 AI Agent 桥接

# Why CursorClaw: Low-Cost, Inheritable, Secure AI Agent Bridge

---

## CursorClaw 是什么？

**一句话：CursorClaw 把你的 Cursor Agent 从 IDE 搬到了聊天窗口。**

你在 Cursor IDE 里精心配置的一切——Rules（规则）、Hooks（钩子）、Skills（技能）、MCP 服务器、项目记忆——CursorClaw 让它们在飞书和 Telegram 里同样生效。你在手机上发一条消息，背后就是完整的 Cursor Agent 在帮你读代码、改文件、跑命令。

```
你（手机 Telegram）: 帮我把 src/utils.js 的 dayjs 换成 date-fns
    ↓
CursorClaw Bridge（你的服务器）
    ↓
Cursor Agent（ACP 子进程）→ 读文件 → 搜索 → 替换 → 跑测试
    ↓
你（手机 Telegram）: 收到流式回复 "已替换 3 个文件，测试通过 ✓"
```

**CursorClaw 不是一个新 Agent**——它是一座桥，桥接你已有的 Cursor 生态到任何消息平台。

<p align="center">
  <img src="images/telegram-streaming.png" width="260" alt="流式回复" />
  &nbsp;&nbsp;
  <img src="images/telegram-schedule-create.png" width="260" alt="创建定时任务" />
  &nbsp;&nbsp;
  <img src="images/telegram-schedule-fire.png" width="260" alt="定时任务触发" />
</p>
<p align="center">
  <em>左：流式回复 + MCP 搜索 ｜ 中：创建定时任务 + 语音 ｜ 右：定时任务按时触发</em>
</p>

---

## 3 分钟配置

### 前提

- 已安装 [Cursor IDE](https://cursor.com/) 并登录（`agent login`）
- Node.js >= 18
- 一个飞书机器人或 Telegram Bot Token

### 步骤

```bash
# 1. 克隆项目
git clone https://github.com/c4bbage/CursorClaw.git
cd CursorClaw

# 2. 一键安装（规则 + hooks + 记忆 + npm 依赖 + .env）
bash setup-claw.sh --bridge

# 3. 编辑 .env，填入你的 Bot 凭据
#    飞书：FEISHU_APP_ID + FEISHU_APP_SECRET
#    Telegram：TELEGRAM_BOT_TOKEN

# 4. 启动
npm start                  # 飞书
npm run start:telegram     # Telegram
```

**就这四步。** 你的 `.cursor/rules`、Skills、MCP 服务器会被 ACP 协议自动加载，不需要额外配置。

### 可选配置

| 配置项 | 作用 | 示例 |
|---|---|---|
| `TELEGRAM_ALLOWED_USERS` | 限制谁能用你的 Bot | `5777935516,987654321` |
| `FEISHU_ALLOWED_USERS` | 限制飞书用户 | `ou_xxxxxxxxxx` |
| `ELEVENLABS_API_KEY` | 启用语音输入/输出 | `sk_xxxxxxxx` |
| `ELEVENLABS_VOICE_ID` | 自定义 TTS 声音 | `JBFqnCBsd6RMkjVDRZzb` |

---

## 为什么不直接用 NanoBot 或 OpenClaw？

2026 年 AI Agent 生态百花齐放——OpenClaw（43 万行 TS）、NanoBot（4000 行 Python）、Claude Code、Codex CLI、Gemini CLI，每个都很强大。但每个都有自己的配置格式、记忆系统、插件生态。

**每换一个工具，你就从零开始配置。**

CursorClaw 的思路不同：**不造新 Agent——桥接你已经投入的那个。**

### 三方对比

| 维度 | **CursorClaw** | **OpenClaw** | **NanoBot** |
|---|---|---|---|
| **定位** | Cursor Agent 的桥接层 | 完整 Agent 平台 | 轻量 Agent |
| **代码量** | ~2K 行 JS | 43 万+ 行 TS | ~4K 行 Python |
| **配置格式** | `.cursor/rules/*.mdc` + `hooks.json`（Cursor 原生） | `AGENTS.md` + `.agents.local.md` | `MEMORY.md` + YAML |
| **模型后端** | Cursor 的模型路由（用你的 Cursor 订阅） | 自行管理 API Key | 11+ 个模型提供商 |
| **消息平台** | 飞书 + Telegram（可扩展） | 无（仅 CLI） | 9 个平台 |
| **记忆系统** | `memory/` + Hooks 注入 | `AGENTS.md` + 草稿本 | `MEMORY.md` + 每日笔记 |
| **工具生态** | Cursor 完整工具集（Read、Write、Shell、Grep、MCP...） | OpenClaw 工具 + MCP | 文件、终端、Web、MCP |
| **Hooks** | 17/18 个 Cursor hook 事件 | 自定义 hooks | 无 |
| **安全模型** | Cursor 沙箱 + 环境变量白名单 | 容器隔离（NanoClaw） | 进程级 |
| **用户成本** | Cursor 订阅（$20/月） | 按模型提供商 API 计费 | 按模型提供商 API 计费 |
| **配置迁移成本** | **零**——直接用现有 `.cursor/` | 需要从头写 `AGENTS.md` | 需要从头写配置 |

### 核心区别

**NanoBot 和 OpenClaw 是 Agent。CursorClaw 是桥。**

- 你已经用 Cursor → CursorClaw **零配置成本**，现有的 rules、hooks、skills、MCP 直接生效
- 你不用 Cursor → CursorClaw 不适合你，直接用 NanoBot 或 OpenClaw

---

## AI Agent 的真实成本

大家都在算 API 费用，很少有人算**维护税**：

| 隐性成本 | 表现 |
|---|---|
| **配置漂移** | 规则在 Cursor 一份、Claude 一份、Copilot 一份，互不同步 |
| **记忆孤岛** | 每个 Agent 独立学习，切换工具即失忆 |
| **插件重复** | 同一个 MCP 服务在 3 个工具里配置 3 遍 |
| **新人上手** | "先读 AGENTS.md，再读 .claude，再读 .cursorrules..." |
| **安全审计** | 每个 Agent 运行时 = 多一个攻击面 |

CursorClaw 通过**复用 Cursor 的原生配置作为唯一事实来源**来消除这些问题。

---

## 工作站继承

AI 辅助开发最难的不是让 Agent 变聪明——而是让它**记住**和**共享**学到的东西。

### 三层继承链

```
~/.cursor/rules/          ← 用户级：你的个人风格（跟着你走）
        ↓ (合并)
.cursor/rules/*.mdc       ← 项目级：团队知识（提交到 git）
        ↓ (合并)
memory/MEMORY.md          ← 长期记忆：架构决策、约定
        ↓ (hooks 注入)
memory/YYYY-MM-DD.md      ← 每日日志：会话级学习（自动生成）
```

**实际效果：**

1. **新人入职** → `git clone` → 所有项目规则 + 记忆 + hooks 就绪。**零配置。**
2. **换电脑** → `~/.cursor/rules/soul.mdc` 带着你的个人风格。项目规则从 git 来。
3. **手机使用** → CursorClaw Bridge 加载完全相同的规则和记忆。不需要单独配置。

### 与 OpenClaw 对比

| | CursorClaw | OpenClaw |
|---|---|---|
| **继承** | 用户 → 项目 → 记忆（3 层自动合并） | `AGENTS.md` + `.agents.local.md`（2 个文件） |
| **共享** | `.cursor/rules/` 提交到 git | `AGENTS.md` 提交到 git |
| **个人覆盖** | `~/.cursor/rules/`（不与团队冲突） | `.agents.local.md`（gitignored） |
| **自动注入** | Hooks 在会话启动时注入记忆 | 需要手动读取 |
| **桥接兼容** | IDE 和 Bridge 用同一套配置 | 仅 CLI |

---

## 安全

### 访问控制

```bash
# 只有这些用户可以和 Bot 对话
TELEGRAM_ALLOWED_USERS=5777935516,987654321
FEISHU_ALLOWED_USERS=ou_xxxxxxxxxx

# 只有这些群组
TELEGRAM_ALLOWED_CHATS=-1001234567890
```

- 空白名单 = 允许所有人（开发阶段方便测试）
- 未授权用户收到拒绝消息，消息里附带他们的 ID（方便你加白）
- 鉴权发生在适配器层，在创建 ACP 会话之前

### 会话隔离

每个会话获得独立的 ACP 进程，按 `channel:conversation:user` 隔离：

```
telegram:chat_123:user_456  →  agent acp（进程 A）
telegram:chat_123:user_789  →  agent acp（进程 B）
feishu:chat_abc:user_xyz    →  agent acp（进程 C）
```

- 用户间无共享状态
- 渠道间无共享状态
- 每个进程以项目文件系统权限运行

### CursorClaw 不做的事

- **不存储消息**——无状态桥接，消息经过即丢弃
- **不代理 API Key**——Cursor CLI 自行认证
- **不修改 Cursor 的安全模型**——你在 IDE 里的安全策略在 Bridge 里同样生效
- `.env` 不入 git，`.env.example` 无敏感信息

---

## 接入其他客户端

CursorClaw 的适配器模式让接入新消息平台变得简单。

### 架构

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Telegram    │  │   飞书      │  │   Slack ?   │  │  Discord ?  │
│  Adapter     │  │   Adapter   │  │   Adapter   │  │   Adapter   │
└──────┬───────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                 │                │                 │
       └────────┬────────┴────────┬───────┘─────────┬──────┘
                │                                   │
         ChannelAdapter（基类）             BridgeController
                │                                   │
         ┌──────┴──────┐                    ┌───────┴───────┐
         │ 标准化消息   │                    │ 路由消息      │
         │ 鉴权         │                    │ 命令菜单      │
         │ 流式回复     │                    │ TTS / STT     │
         │ 语音         │                    │ 应用命令      │
         └─────────────┘                    └───────────────┘
```

### 接入新客户端

继承 `ChannelAdapter` 并实现 5 个方法：

```javascript
import { ChannelAdapter } from '../channels/channel-adapter.js';

export class SlackAdapter extends ChannelAdapter {
  constructor(options) {
    super('slack', options);
  }

  async start() { /* 启动消息监听 */ }

  async sendReply(target, text) { /* 发送消息到 Slack */ }

  createStreamHandle(target) {
    return {
      update: async (text) => { /* 编辑已有消息 */ },
      finalize: async (text) => { /* 最终更新 */ }
    };
  }

  async resolvePromptInput(message) {  // 可选：解析图片/语音
    return { promptText: message.text, promptOptions: {} };
  }

  async sendAudio(target, buffer, options) { /* 可选：发送语音 */ }
}
```

然后在入口文件中连接：

```javascript
const adapter = new SlackAdapter({ token: process.env.SLACK_TOKEN });
const sessions = new CursorSessionManager({ cwd: process.cwd() });
const controller = new BridgeController({ channelAdapter: adapter, cursorSessions: sessions });
adapter.on('message', msg => controller.handleMessage(msg));
await adapter.start();
```

**就这些。** `BridgeController` 处理其余一切——路由、会话生命周期、hooks、命令、TTS。

### 潜在接入方向

| 平台 | 难度 | 说明 |
|---|---|---|
| **Slack** | 中 | 富消息 API、线程、文件上传 |
| **Discord** | 中 | 斜杠命令、嵌入卡片、语音频道 |
| **企业微信** | 中 | 和飞书模式类似 |
| **CLI / 终端** | 低 | stdin/stdout 适配器，适合脚本化 |
| **HTTP API** | 低 | REST 端点，任何客户端都能接入 |
| **GitHub Issues/PR** | 中 | 评论驱动的 Agent，CI 集成 |
| **邮件** | 低 | IMAP/SMTP 适配器，异步工作流 |

---

## 将 Cursor 嵌入你的工作流

CursorClaw 不只是一个聊天机器人——它是把 Cursor Agent 嵌入现有流程的方式。

### 场景 1：晨会简报

```
定时任务（每天 8:00）→ CursorClaw
  → Agent 读 git log、未合并 PR、失败测试
  → 推送摘要到团队飞书群
```

只需发一条消息："每天早上 8 点给我推送项目状态"

### 场景 2：值班告警

```
告警（PagerDuty/Grafana）→ 转发到 Telegram
  → CursorClaw 收到告警文本
  → Agent 搜索代码库相关错误处理逻辑
  → 给出修复建议或创建 draft PR
```

### 场景 3：手机上 Code Review

```
你（地铁上）: "review 最新的 PR，重点看安全问题"
  → CursorClaw → Cursor Agent
  → Agent 读 diff、检查注入、鉴权问题
  → 流式推送 review 意见到 Telegram
```

### 场景 4：文档自动更新

```
定时任务（每周）→ CursorClaw
  → Agent 读最近改动、更新 API 文档
  → 提交并推送
  → 发送摘要到飞书
```

### 场景 5：多 Agent 流水线

```
Claude Code（写代码）→ git push
  → CursorClaw 定时任务检测新提交
  → Cursor Agent（通过 Bridge）跑测试、Review、生成报告
  → 结果推送到 Telegram
```

核心洞察：**Cursor Agent 已经拥有所有工具**——文件读写、终端、搜索、MCP。CursorClaw 只是给它开了一扇新的门。

---

## 什么时候不该用 CursorClaw

坦诚面对取舍：

| 场景 | 更好的选择 |
|---|---|
| 你不用 Cursor | NanoBot（轻量、多模型）或 OpenClaw |
| 需要 9+ 个消息平台 | NanoBot（开箱支持 9 个） |
| 需要容器级安全隔离 | NanoClaw |
| 需要完全自托管模型 | NanoBot + vLLM 或 Ollama |
| 团队用不同 IDE | OpenClaw（IDE 无关） |

**CursorClaw 适合的场景：** 你已经投入了 Cursor 生态（rules、hooks、skills、MCP、订阅），想把这些投入**延伸**到消息平台、自动化工作流和移动端——而不需要维护一套独立的 Agent 配置。

---

## 总结

| | 造一个新 Agent | 桥接到 Cursor |
|---|---|---|
| **配置成本** | 高——新格式、新规则、新插件 | **零**——直接用 `.cursor/` |
| **记忆** | 每个工具独立 | 通过 `memory/` + hooks 共享 |
| **工具** | 需要自建或集成 | Cursor 完整工具集 |
| **安全** | 需要从头构建 | 继承 Cursor 安全模型 + 白名单 |
| **维护** | 多一个系统要更新 | 薄桥接层，Cursor 做重活 |
| **可移植性** | 到处能用，到处要配 | Cursor CLI 在哪里就在哪里能用 |

**维护成本最低的 Agent，是你不需要自己造的那一个。**

---

## 开始使用

```bash
git clone https://github.com/c4bbage/CursorClaw.git
cd CursorClaw
bash setup-claw.sh --bridge
# 编辑 .env → npm start
```

- [GitHub](https://github.com/c4bbage/CursorClaw)
- [快速上手指南](cursorclaw-quickstart.md)
- [Hooks 兼容文档](hooks-bridge.md)
- [功能展示](cursorclaw-bridge-share.md)

---

*English version of this article is available in the same file — scroll up for bilingual headings, or see [README.md](../README.md) for the English overview.*
