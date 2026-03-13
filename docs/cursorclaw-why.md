# 2026 AI Agent 生态：从 OpenClaw 到 NanoBot，我为什么选择造一座桥

> Cursor、Claude Code、Codex、Gemini CLI——2026 年的 AI 编程工具多到让人焦虑。每个都很强，每个都想成为你的唯一入口。但真正的问题不是"哪个最强"，而是"我在这些工具上的投入，能不能不白费"。

---

## 一、Agent 平台之争

### OpenClaw：全能型重装平台

[OpenClaw](https://docs.openclaw.ai/) 是 2026 年 AI Agent 领域的标杆级项目。43 万行 TypeScript，它几乎什么都做了：

- **AGENTS.md 系统**——项目级的 Agent 知识库。一个 Markdown 文件承载项目的架构、约定、踩坑记录，每次会话自动加载。嵌入式上下文的成功率是 100%，而让 Agent 自行查找只有 53%。这个发现影响了整个行业。
- **多 Agent 路由**——根据任务类型自动分配给不同 Agent，每个 Agent 有专属工具集和权限。
- **ClawHub 技能市场**——社区共享的 Agent Skills，类似 npm 之于 Node.js。
- **容器隔离（NanoClaw）**——每个 Agent 运行在独立容器里，文件系统和网络完全隔离。

OpenClaw 的设计哲学是**大一统**——它想成为 Agent 的操作系统，所有工具、所有模型、所有工作流都在它的框架内运行。

**优点：** 功能最全，生态最大，安全模型最完善。

**代价：** 43 万行代码意味着高学习曲线。自行管理 API Key，按模型提供商计费。配置格式（`AGENTS.md` + `.agents.local.md`）是 OpenClaw 专属的——你在 Cursor 里的 Rules 和 Hooks 用不上，得重新写一套。

### NanoBot：极简主义的反叛

[NanoBot](https://nanobot.club/) 是香港大学 HKUDS 实验室的作品，2026 年 2 月发布，迅速拿到 3 万+ GitHub Stars。它的卖点是一个字：**小**。

- **4000 行 Python**——OpenClaw 的百分之一。整个代码库一个小时能审完。
- **9 个消息平台**——Telegram、Discord、WhatsApp、Slack、飞书、钉钉、QQ、邮件、Mochat，开箱即用。
- **11+ 个模型提供商**——OpenRouter、Anthropic、OpenAI、DeepSeek、Gemini、Groq、vLLM（本地模型）……你想用哪个用哪个。
- **MEMORY.md + 每日笔记**——和 OpenClaw 类似的记忆系统，但更轻量。
- **定时任务**——基于 apscheduler 的 cron 系统。
- **MCP 支持**——可以接入 Model Context Protocol 工具。

NanoBot 的设计哲学是**够用就好**——用最少的代码实现 OpenClaw 的核心能力。对于研究者和想要完全掌控代码的开发者来说，这非常有吸引力。

**优点：** 极轻量，平台覆盖广，pip install 即用，代码完全可审计。

**代价：** 轻量也意味着工具集有限——文件操作、终端、Web 访问、MCP，基本够用但不如 Cursor 丰富。没有 Hooks 系统。自行管理 API Key。配置格式同样是 NanoBot 专属的。

### 它们的共同问题

OpenClaw 和 NanoBot 都很出色，但它们有一个共同的假设：**你愿意从零开始配置一个新的 Agent 环境。**

如果你已经在 Cursor IDE 里花了几周时间——精心写了 Rules、配好了 Hooks、调试了 MCP 服务器、积累了 Skills、建立了记忆文件——这些投入怎么办？

```
Cursor IDE 里的你：
  .cursor/rules/agents.mdc     ← 项目知识（花了 2 小时写的）
  .cursor/rules/soul.mdc       ← Agent 人格（调了 3 天才满意）
  .cursor/hooks.json            ← 6 个 hook 脚本
  .cursor/mcp.json              ← 4 个 MCP 服务器
  ~/.cursor/skills/             ← 12 个全局 Skills
  memory/MEMORY.md              ← 积累了 2 个月的项目知识

切换到 NanoBot 或 OpenClaw：
  以上全部作废。从零开始。
```

---

## 二、另一种思路：不造 Agent，造桥

这就是 CursorClaw 的出发点。

**CursorClaw 不是一个新的 Agent 平台。它是一座桥——把你已经投入的 Cursor 生态，延伸到 IDE 之外的任何地方。**

```
你（手机 Telegram）: 帮我把 src/utils.js 的 dayjs 换成 date-fns
    ↓
CursorClaw Bridge（你的服务器上跑着的一个 Node.js 进程）
    ↓
Cursor Agent（通过 ACP 协议启动的子进程）
    → 自动加载你的 .cursor/rules/*.mdc
    → 自动加载你的 .cursor/hooks.json
    → 自动连接你的 MCP 服务器
    → 自动使用你的 ~/.cursor/skills/
    → 读文件 → 搜索 → 替换 → 跑测试
    ↓
你（手机 Telegram）: 收到流式回复 "已替换 3 个文件，测试通过 ✓"
```

关键词是**自动加载**。你在 IDE 里配过什么，Bridge 里就有什么。零迁移成本。

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

## 三、CursorClaw 做了什么

### 3 分钟配置

```bash
git clone https://github.com/c4bbage/CursorClaw.git
cd CursorClaw
bash setup-claw.sh --bridge   # 安装规则 + hooks + 记忆 + npm 依赖 + .env
# 编辑 .env，填入 Bot Token
npm start                      # 飞书
npm run start:telegram         # Telegram
```

四步。不需要学新的配置格式，不需要管理 API Key（用 Cursor 订阅），不需要重写规则。

### 核心能力

| 能力 | 说明 |
|---|---|
| **多渠道** | 飞书 + Telegram，统一适配器接口 |
| **流式回复** | Agent 生成时实时更新消息，不用等全部完成 |
| **语音交互** | 语音输入自动转写（ElevenLabs STT），`/voice` 开启语音回复（TTS） |
| **Hooks 兼容** | 17/18 个 Cursor hook 事件在 ACP 模式下完整工作 |
| **Rules & Skills** | `.cursor/rules/*.mdc`、`AGENTS.md`、全局 Skills 自动加载 |
| **会话隔离** | 按 `channel:conversation:user` 隔离，多用户互不干扰 |
| **定时任务** | Agent 可以创建 cron 任务，主动推送结果 |
| **跨会话记忆** | Hooks 在会话启动时注入 `memory/MEMORY.md` 和每日日志 |
| **权限控制** | 环境变量配置用户/群组白名单 |
| **命令菜单** | `/help`、`/cancel`、`/status`、`/memory`、`/clear`、`/tasks`、`/voice` |

### Hooks：最重要的技术细节

Cursor IDE 的 [Hooks](https://docs.cursor.com/context/hooks) 是一个被严重低估的能力——它让你在 Agent 的生命周期事件上挂载自定义脚本。比如：

- `sessionStart` → 注入记忆文件
- `preToolUse` → 拦截危险操作
- `postToolUse` → 记录工具调用日志
- `stop` → 会话结束时写摘要到每日日志

问题是：Hooks 只在 IDE 里生效。Cursor 的 `agent acp` CLI 不会触发它们。

**CursorClaw 的 HookRunner 解决了这个问题。** 它读取 `.cursor/hooks.json`，在 ACP 桥接的等效生命周期节点触发相同的脚本。你已有的 hook 脚本不需要改一行代码。

18 个 Agent hook 事件中，我们实现了 17 个。唯一缺失的是 `preCompact`（ACP 协议没有暴露上下文压缩事件）。

---

## 四、三者对比

| 维度 | **OpenClaw** | **NanoBot** | **CursorClaw** |
|---|---|---|---|
| **定位** | 完整 Agent 平台 | 轻量 Agent | Cursor Agent 的桥接层 |
| **代码量** | 43 万+ 行 TS | ~4K 行 Python | ~2K 行 JS |
| **配置格式** | `AGENTS.md`（专属） | YAML + `MEMORY.md`（专属） | `.cursor/rules/*.mdc`（**Cursor 原生**） |
| **模型** | 自行管理 API Key | 11+ 提供商，自行管理 Key | Cursor 订阅（$20/月） |
| **消息平台** | 无（仅 CLI） | 9 个 | 飞书 + Telegram（可扩展） |
| **工具集** | OpenClaw 工具 + MCP | 文件、终端、Web、MCP | **Cursor 完整工具集**（Read、Write、Shell、Grep、MCP...） |
| **Hooks** | 自定义 hooks | 无 | **17/18 Cursor hooks** |
| **安全** | 容器隔离（NanoClaw） | 进程级 | Cursor 沙箱 + 白名单 |
| **迁移成本** | 需从头写 AGENTS.md | 需从头写配置 | **零**（直接用现有 .cursor/） |

**结论：它们不是竞品，是互补的。**

- 你不用 Cursor → 用 NanoBot（轻量、多模型）或 OpenClaw（全能）
- 你已经投入 Cursor 生态 → CursorClaw 让你的投入延伸到 IDE 之外

---

## 五、隐性成本：大家不谈的维护税

大家都在比 API 价格，很少有人算**维护税**：

| 隐性成本 | 表现 |
|---|---|
| **配置漂移** | 规则在 Cursor 一份、Claude 一份、OpenClaw 一份，互不同步 |
| **记忆孤岛** | 每个 Agent 独立学习，切换工具即失忆 |
| **插件重复** | 同一个 MCP 服务在 3 个工具里配置 3 遍 |
| **新人上手** | "先读 AGENTS.md，再读 .cursorrules，再读 nanobot.yaml..." |
| **安全审计** | 每个 Agent 运行时 = 多一个攻击面 |

CursorClaw 的策略：**只维护一套配置（`.cursor/`），所有入口共享。**

IDE 里改了一条 Rule → Bridge 下次会话自动生效。
IDE 里加了一个 MCP 服务器 → Bridge 自动连接。
IDE 里写了一个 Hook → Bridge 自动触发。

---

## 六、工作站继承：三层配置链

AI 辅助开发最难的不是让 Agent 变聪明——而是让它**记住**和**共享**学到的东西。

```
~/.cursor/rules/          ← 用户级：你的个人风格（跟着你走）
        ↓ (自动合并)
.cursor/rules/*.mdc       ← 项目级：团队知识（提交到 git）
        ↓ (自动合并)
memory/MEMORY.md          ← 长期记忆：架构决策、约定
        ↓ (hooks 注入)
memory/YYYY-MM-DD.md      ← 每日日志：会话级学习（自动生成）
```

**实际效果：**

- **新人入职** → `git clone` → 所有项目规则 + 记忆 + hooks 就绪。**零配置。**
- **换电脑** → `~/.cursor/rules/soul.mdc` 带着你的个人风格，项目规则从 git 来
- **手机使用** → CursorClaw Bridge 加载完全相同的规则和记忆，不需要单独配置
- **团队成员个性化** → 用户级 `soul.mdc` 覆盖项目级，不影响其他人

对比 OpenClaw 的两文件系统（`AGENTS.md` + `.agents.local.md`），CursorClaw 多了一层用户级配置，并且通过 Hooks 实现了自动注入，不需要 Agent 手动读取。

---

## 七、安全

### 访问控制

```bash
# 只允许特定用户
TELEGRAM_ALLOWED_USERS=5777935516,987654321
FEISHU_ALLOWED_USERS=ou_xxxxxxxxxx

# 只允许特定群组
TELEGRAM_ALLOWED_CHATS=-1001234567890
```

- 空白名单 = 允许所有人（开发阶段）
- 未授权用户收到拒绝消息，消息里附带 ID（方便加白）
- 鉴权在适配器层，ACP 会话创建之前

### 会话隔离

```
telegram:chat_123:user_456  →  独立 agent acp 进程 A
telegram:chat_123:user_789  →  独立 agent acp 进程 B
feishu:chat_abc:user_xyz    →  独立 agent acp 进程 C
```

用户间、渠道间完全隔离，无共享状态。

### CursorClaw 不做的事

- **不存储消息**——无状态桥接，消息经过即丢弃
- **不代理 API Key**——Cursor CLI 自行认证
- **不修改 Cursor 的安全模型**——IDE 里的安全策略在 Bridge 里同样生效

---

## 八、接入更多客户端

CursorClaw 的适配器架构让接入新平台变得简单——继承 `ChannelAdapter`，实现 5 个方法：

```javascript
export class SlackAdapter extends ChannelAdapter {
  async start() { /* 启动消息监听 */ }
  async sendReply(target, text) { /* 发送消息 */ }
  createStreamHandle(target) { /* 流式更新句柄 */ }
  async resolvePromptInput(message) { /* 可选：解析图片/语音 */ }
  async sendAudio(target, buffer) { /* 可选：发送语音 */ }
}
```

`BridgeController` 处理其余一切——路由、会话、hooks、命令、TTS。

| 潜在方向 | 难度 | 说明 |
|---|---|---|
| Slack | 中 | 富消息 API、线程 |
| Discord | 中 | 斜杠命令、语音频道 |
| 企业微信 | 中 | 和飞书模式类似 |
| CLI / 终端 | 低 | stdin/stdout，适合脚本化 |
| HTTP API | 低 | REST 端点，任何客户端可接 |
| GitHub Issues | 中 | 评论驱动 Agent，CI 集成 |

---

## 九、将 Cursor 嵌入工作流

CursorClaw 不只是聊天机器人——它让 Cursor Agent 成为工作流的一个节点。

**晨会简报：** 定时任务每天 8 点 → Agent 读 git log、未合并 PR、失败测试 → 推送到飞书群

**值班告警：** Grafana 告警 → 转发到 Telegram → Agent 搜索代码库找到相关处理逻辑 → 给出修复建议

**手机 Code Review：** 地铁上发一条 "review 最新 PR，重点看安全" → Agent 读 diff、检查注入和鉴权 → 流式推送 review 意见

**多 Agent 流水线：** Claude Code 写代码 → git push → CursorClaw 检测新提交 → Cursor Agent 跑测试和 Review → 结果推送到 Telegram

核心洞察：**Cursor Agent 已经拥有所有工具**——文件读写、终端、搜索、MCP。CursorClaw 只是给它开了一扇新的门。

---

## 十、什么时候不该用 CursorClaw

| 场景 | 更好的选择 |
|---|---|
| 你不用 Cursor | NanoBot 或 OpenClaw |
| 需要 9+ 消息平台 | NanoBot（开箱 9 个） |
| 需要容器级隔离 | NanoClaw |
| 需要完全自托管模型 | NanoBot + vLLM / Ollama |
| 团队用不同 IDE | OpenClaw（IDE 无关） |

**CursorClaw 适合你，当且仅当：** 你已经投入了 Cursor 生态，想把这些投入延伸到消息平台、自动化工作流和移动端。

---

## 总结

2026 年的 AI Agent 生态不缺强大的工具。OpenClaw 是全能平台，NanoBot 是极简利器，Claude Code 和 Codex 在终端里无所不能。

但如果你已经在 Cursor IDE 里建立了一整套工作体系——Rules、Hooks、Skills、MCP、记忆——那么最聪明的做法不是再造一个 Agent，而是**把这套体系延伸出去**。

**维护成本最低的 Agent，是你不需要自己造的那一个。**

```bash
git clone https://github.com/c4bbage/CursorClaw.git
cd CursorClaw
bash setup-claw.sh --bridge
# 编辑 .env → npm start
```

- [GitHub](https://github.com/c4bbage/CursorClaw)
- [快速上手](cursorclaw-quickstart.md)
- [Hooks 兼容文档](hooks-bridge.md)
- [功能展示](cursorclaw-bridge-share.md)
