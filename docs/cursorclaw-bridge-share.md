# CursorClaw Bridge：把 Cursor Agent 搬到你的聊天窗口

> 我用飞书给 AI 发了一条语音，它转写后读了我的代码仓库，自动截图确认 Bug，写了修复方案，把结果用语音念给我——而我全程没打开 IDE。

这篇文章记录我如何借助 Cursor 的 ACP 协议（Agent Client Protocol）和 Hooks/Rules 原生能力，搭建了一套叫 **CursorClaw Bridge** 的系统，让 Cursor Agent 跑在飞书和 Telegram 上，拥有完整的编码能力、跨会话记忆和语音交互。

---

## 先看效果

### 1. 发消息就是写代码

在 Telegram 里输入一句话，Cursor Agent 就在后台编辑你的项目文件、跑终端命令、搜索代码库，然后把结果流式推回来——就像你在 IDE 里用 Cmd+K 一样，但入口变成了手机上的聊天框。

```
我: 把 src/utils.js 里的 dayjs 换成 date-fns，保持接口不变
Bot: ⚙️ Read...
     ⚙️ Grep...
     ⚙️ StrReplace...
     已将 dayjs 替换为 date-fns，改动 3 个文件：
     - src/utils.js (主逻辑)
     - src/formatters.js (日期格式化)
     - test/utils.test.js (测试)
     所有测试通过 ✓
```

### 2. 全局 Skills 直接可用

Cursor 配置的 Skills（`~/.cursor/skills/`）在 Bridge 里同样生效。我可以在飞书里说"帮我分析这个安全事件"，Agent 会自动加载我预配的 `security-incident-analysis` Skill，查询 ELK 数据源、关联 SSH 日志、生成报告——这个 Skill 是我之前为 IDE 写的，不需要为 Bridge 做任何改动。

```
我: 192.168.1.50 这台机器好像被入侵了，帮我分析一下
Bot: ⚙️ Shell (querying ELK)...
     ⚙️ Read...
     ⚙️ Shell (checking SSH logs)...

     ## 安全事件分析报告
     - 攻击链：钓鱼邮件 → 横向移动 → C2 通信
     - 影响范围：3 台主机
     - 建议：立即隔离 192.168.1.50，重置受影响账号凭据...
```

### 3. 截屏确认

Agent 可以截取网页截图来验证 UI 变更。在聊天里说"帮我看看线上页面是不是正常"，它会用 browser-use 工具打开浏览器、导航、截屏，然后把截图发到聊天里。

```
我: 打开 https://example.com/dashboard 截个图看看样式对不对
Bot: ⚙️ browser_navigate...
     ⚙️ browser_snapshot...
     ⚙️ browser_screenshot...
     [图片]
     页面加载正常，顶部导航栏和数据卡片布局一致，
     但右侧图表的 Y 轴标签被截断了，建议加 padding-right。
```

### 4. 定时任务主动推送

通过 App Commands，Agent 可以自己设置定时任务。你可以说"每天早上 9 点帮我检查一下服务器状态"，Agent 会创建一个 cron 任务，到点自动跑一遍检查，然后主动把结果推送到你的聊天窗口。

```
我: 每天早上9点检查一下 production 服务器的磁盘和内存
Bot: ✅ 已创建定时任务
     Cron: 0 9 * * *
     任务: 检查 production 服务器磁盘和内存使用率

     ---（第二天早上 9:00）---

Bot: 📊 每日服务器巡检
     - 磁盘: /dev/sda1 使用率 73% (正常)
     - 内存: 12.4G / 16G (77%, 注意)
     - 建议: 清理 /var/log 下超过 30 天的日志文件
```

### 5. 语音对话

发一条语音消息，ElevenLabs 自动转写成文字交给 Agent；回复时用 `/voice` 开启语音模式，Agent 的文字回复会额外生成一条语音消息。整个流程：

```
🎤 我: [语音] "这个函数的参数校验逻辑有问题"
Bot: (自动转写) → 分析代码 → 文字回复
     + 🔊 [语音] "我看了一下 validateInput 函数，
       第 42 行的类型检查缺少了 null 的处理..."
```

---

## 为什么做这个

Cursor 是目前最强的 AI 编码 IDE，但它被锁在桌面应用里。我有几个场景需求：

1. **移动端**：通勤时想让 AI 帮忙处理一些简单的代码修改
2. **协同**：团队成员不一定都装了 Cursor，但都有飞书
3. **自动化**：需要 Agent 在无人值守时执行定时任务并汇报
4. **语音**：开车或者手不方便时，用语音和 AI 交互

Cursor 官方提供了 `agent acp` 命令——一个 headless CLI，通过 stdio 的 JSON-RPC 协议和外部客户端通信。这就是突破口。

---

## 架构

```
┌──────────┐     ┌──────────┐
│  飞书     │     │ Telegram │
│  用户     │     │  用户     │
└────┬─────┘     └────┬─────┘
     │  WebSocket      │  Polling
     ▼                 ▼
┌─────────────────────────────┐
│      Channel Adapters       │
│  (Feishu / Telegram)        │
│  权限控制 · 流式更新 · 语音  │
└────────────┬────────────────┘
             │
             ▼
┌─────────────────────────────┐
│      BridgeController       │
│  消息路由 · Bot 命令 · TTS   │
│  扩展事件 · App Commands     │
└────────────┬────────────────┘
             │
     ┌───────┴───────┐
     ▼               ▼
┌──────────┐  ┌────────────┐
│ Session  │  │ HookRunner │
│ Manager  │  │            │
│          │  │ hooks.json │
│ scopeKey │  │ 17/18 对齐  │
│ 隔离     │  │            │
└────┬─────┘  └────────────┘
     │
     ▼
┌─────────────────────────────┐
│    agent acp (子进程)        │
│                             │
│  .cursor/rules/*.mdc  ← 自动加载
│  AGENTS.md / CLAUDE.md ← 自动加载
│  .cursor/mcp.json     ← MCP 工具
│  ~/.cursor/skills/    ← 全局技能
│                             │
│  JSON-RPC 2.0 over stdio   │
└─────────────────────────────┘
```

核心思路很简单：**把聊天消息翻译成 ACP 协议的 prompt，把 ACP 的流式响应翻译回聊天消息**。难点在中间那一堆胶水：权限、流式更新、交互式确认、hooks 兼容、会话隔离、语音。

---

## 关键设计

### scopeKey：跨渠道会话隔离

每个 ACP session 绑定到一个 `scopeKey = channel:conversation:user`。飞书的张三和 Telegram 的李四，即使同时跟 Bot 对话，也不会串 session。每个 session 对应一个独立的 `agent acp` 子进程。

### Hooks 兼容层

Cursor IDE 的 Hooks 在 ACP 模式下不会触发（因为没有 IDE 的 composer 事件体系）。我写了一个 `HookRunner`，读取项目里的 `.cursor/hooks.json`，在桥接代码的等效生命周期点执行相同的脚本，传入相同的 JSON schema。

**20 个 hook 事件对齐了 17 个**，唯一缺失的 `preCompact`（上下文压缩）是 ACP 协议不暴露的。所有 `before*` 类 hook 都支持 deny 拦截，`sessionStart` 的 `additional_context` 会注入到第一个 prompt 里——这就是跨会话记忆的注入点。

### Rules 生效

好消息是 `.cursor/rules/*.mdc` 在 ACP 模式下**原生生效**。这意味着我在 IDE 里定义的项目规则、人格设定、工具使用指南，通过 Bridge 发消息时一样生效。`AGENTS.md` 和 `CLAUDE.md` 也会被自动读取。

### 流式输出

飞书和 Telegram 都不是为流式文本设计的。实现方式是：先发一条 placeholder 消息，然后在 Agent 生成过程中不断 `editMessage` 更新内容。加了节流（1.2 秒 / 24 字符最小增量）避免 API 限频。最终结果用 HTML 格式渲染（Telegram）或 post 富文本（飞书）。

### ElevenLabs 语音

语音交互分两个方向：

- **STT（语音转文字）**：Telegram 语音消息下载为 OGG，调 ElevenLabs STT API 转写；飞书先用内置 STT，失败了再降级到 ElevenLabs
- **TTS（文字转语音）**：用户发 `/voice` 开启后，每条文字回复额外生成一条 MP3 语音消息。自动剥离 markdown/代码块再合成

### App Commands

Agent 的回复里可以嵌入结构化命令（JSON 格式），Bridge 解析后执行。目前支持 `schedule_task`（创建 cron 定时任务）和 `send_file`（发送文件到聊天）。这让 Agent 能主动设置提醒、定时巡检、发送生成的报告。

---

## 命令菜单

两个渠道都注册了统一的 Bot 命令：

| 命令 | 功能 |
|---|---|
| `/help` | 显示可用命令 |
| `/cancel` | 取消当前正在执行的任务 |
| `/status` | 查看当前会话状态（运行时间、空闲时间） |
| `/memory` | 查看项目记忆（MEMORY.md + 今日日志） |
| `/clear` | 重置 ACP 会话（清除上下文） |
| `/tasks` | 查看已创建的定时任务 |
| `/voice` | 开关语音回复模式 |

Telegram 用 `setMyCommands` 注册到输入框的 `/` 菜单；飞书通过 `application.bot.menu_v6` 事件监听菜单点击。

---

## CursorClaw 记忆系统

Bridge 不只是一个消息转发器。通过 CursorClaw 的记忆架构，Agent 在远程渠道里也能拥有跨会话的项目认知：

```
memory/
├── MEMORY.md          ← 长期记忆（手动维护，git 跟踪）
└── 2026-03-13.md      ← 今日会话日志（hook 自动写入）

.cursor/
├── rules/
│   ├── agents.mdc     ← 项目知识（自动加载）
│   ├── soul.mdc       ← 人格设定（自动加载）
│   ├── tools.mdc      ← 工具使用指南（自动加载）
│   └── bridge.mdc     ← 桥接数据流（按 glob 触发）
├── hooks.json         ← hook 配置（Bridge 兼容）
└── hooks/
    ├── session-memory.sh  ← 会话启动时注入记忆
    ├── session-summary.sh ← 会话结束时写日志
    └── log-event.sh       ← 全事件 JSONL 日志
```

`session-memory.sh` 在每个新 session 启动时被 HookRunner 调用，读取 `MEMORY.md` + 今日/昨日日志，通过 `additional_context` 注入到 Agent 的上下文里。这样 Agent 每次"醒来"都带着之前的记忆，而不是一张白纸。

---

## 权限控制

裸跑的 Bot 任何人都能连，这在 Telegram 上尤其危险（因为别人消耗的是你的 Cursor 额度）。通过环境变量配置白名单：

```bash
# 只允许特定用户
TELEGRAM_ALLOWED_USERS=5777935516,987654321
# 或者只允许特定群
TELEGRAM_ALLOWED_CHATS=-1001234567890
```

未授权的用户发消息会收到一条包含他们 ID 的拒绝回复，方便你按需加白。飞书同理，通过 `open_id` 控制。

---

## 踩过的坑

### 1. Telegram 双实例

kill 旧进程后立即启动新进程，旧的 polling 连接还没断开，Telegram API 会把同一条消息推给两个实例，用户收到两条回复。解决方法：`kill -9` 确保旧进程完全退出，等 1 秒再启新的。

### 2. ACP 协议的沉默

ACP 模式下很多信息是"沉默"的——工具执行结果、工具失败、上下文压缩都不会主动通知客户端。你只能看到 `tool_call` 开始了，但看不到它结束了没、输出了什么。hook 的 `afterShellExecution` 在 Bridge 里拿不到 `output` 字段，只能记录 `command`。

### 3. 飞书消息格式

飞书的 `interactive` 卡片消息在我这的 schema 一直联调不过，最后回退到稳定的 `post` 消息格式。虽然不好看，但至少不会报错。

### 4. 流式更新的 400 错误

Telegram 的 `editMessageText` 如果新旧内容完全一样会返回 400。加了去重检查：只在内容实际变化时才调 edit。

### 5. session/new 的 mcpServers

一开始 `session/new` 默认传 `mcpServers: []`，结果把"未显式配置 MCP"和"显式传空 MCP"混为一谈了。现在只在明确配置时才传。

---

## 未来方向

- **图片生成**：Agent 已经支持 `cursor/generate_image` 扩展事件，可以把生成的图片转发到聊天
- **多模态输入**：支持用户发图片给 Agent 分析（Telegram 已支持，飞书已支持）
- **Cloud Agent 联动**：Cursor 新增了 Cloud Agent 能力，可以把长任务推到云端执行
- **Web 面板**：加一个简易 Web UI 查看所有活跃 session、日志、记忆
- **企业级 Hooks**：对接 Snyk、Semgrep 等安全扫描 hook，在 Bridge 里也执行代码安全检查

---

## 总结

CursorClaw Bridge 本质上做了一件事：**把 Cursor Agent 的能力从 IDE 窗口解放出来，送到任何有聊天输入框的地方**。

技术上它是一个 ACP 协议适配器 + 渠道网关 + hooks 兼容层。但从使用体验上，它让我可以在地铁上用手机语音告诉 AI"把那个 Bug 修了"，到公司打开 IDE 时代码已经改好了。

核心代码大约 1500 行 JavaScript，没有框架依赖（除了各平台 SDK）。如果你也想试试，项目里有 `setup-claw.sh` 一键安装脚本和完整的 quickstart 文档。

---

*项目地址：[CursorClaw Bridge](https://github.com/c4bbage/CursorClaw)*
