# Cursor Agent CLI 局限性 vs Bridge 架构

> 梳理 `cursor agent acp` CLI 的设计边界，以及 CursorClaw Bridge 为什么存在。

---

## 一、Cursor Agent CLI 是什么

```bash
cursor agent acp
```

启动一个 ACP (Agent Client Protocol) 进程，通过 **stdin/stdout JSON-RPC 2.0** 与外部通信。
这是 Cursor 官方提供的 headless agent 接口。

### ACP 协议核心方法

| 方法 | 方向 | 用途 |
|------|------|------|
| `initialize` | Client → Agent | 握手，声明 capabilities |
| `authenticate` | Client → Agent | 登录 Cursor 账号 |
| `session/new` | Client → Agent | 创建会话（指定 cwd、mcpServers） |
| `session/prompt` | Client → Agent | 发送 prompt + 图片 |
| `session/cancel` | Client → Agent | 取消当前 prompt |
| `session/update` | Agent → Client | 流式回复、tool call、thought chunk |
| `cursor/*` | Agent → Client | Extension events (ask_question, create_plan, todos, image, task) |

## 二、CLI 的局限性

### 1. 无多通道能力

CLI 是一个 **stdio 管道** — 一端进、一端出。它不知道消息来自飞书还是 Telegram，不关心 UI 层。

```
用户 → [???] → stdin → cursor agent acp → stdout → [???] → 用户
         ^                                           ^
         └── CLI 不管这两端是什么 ──────────────────────┘
```

**Bridge 解决**：`ChannelAdapter` 抽象层，统一 Feishu/Telegram 的消息输入输出。

### 2. 无会话隔离

CLI 启动一个进程 = 一个 session。如果有多个用户、多个聊天，你需要自己管理多个进程。

**Bridge 解决**：`scopeKey = channel:conversationKey:userKey`，每个 key 一个 `CursorBridge` 进程，互不干扰。`CursorSessionManager` 自动创建/复用/清理。

### 3. 无流式 UI 适配

CLI 输出原始 JSON-RPC chunks。不同平台对流式消息的处理完全不同：
- 飞书：先发一条消息，然后 `message.update()` 更新内容
- Telegram：先 `sendMessage`，然后 `editMessageText` 更新
- 都有字数限制、格式限制、速率限制

**Bridge 解决**：`createStreamHandle()` 返回平台感知的 stream handle，`push(text)` 和 `finalize(text)` 内部处理差异。

### 4. 无 Extension Event 路由

CLI 发出 `cursor/ask_question`、`cursor/create_plan` 等事件时，只是通过 stdout 输出 JSON。如何呈现给用户？格式化为什么？发到哪里？CLI 不管。

**Bridge 解决**：`BridgeController.handleCursorEvent()` 路由每种 event type，格式化为可读文本，发送到对应的聊天窗口。

### 5. 无 App-Command 执行层

Agent 可能在回复中嵌入结构化指令（定时任务、发文件等），CLI 没有执行这些指令的能力。

**Bridge 解决**：`AppResponseAccumulator` 提取 `app-commands` 代码块，`AppCommandExecutor` 执行，`TaskScheduler` 持久化定时任务。

### 6. 无持久化

CLI 进程退出 = 一切归零。没有 session 持久化、没有 task 持久化。

**Bridge 解决**：
- `TaskScheduler` 文件持久化（`data/tasks-*.json`），重启恢复
- Memory 系统（`memory/MEMORY.md` + daily logs）跨 session 持续

### 7. 无时间感知

CLI 不在 prompt 中注入当前时间。长会话中 Agent 对时间的认知完全依赖初始注入。

**Bridge 解决**：每次 `session/prompt` 时在用户消息前注入 `当前时间: YYYY/MM/DD HH:MM weekday`，不破坏 prompt cache。

### 8. 无安全边界

CLI 对 prompt 内容不做任何校验。任何通过 stdin 传入的内容都会直接发给 Agent。

**Bridge 解决**：
- `allowedUsers` / `allowedChats` 白名单
- `beforeSubmitPrompt` hook 可以拦截或修改 prompt
- `harness-check.sh` stop hook 做代码质量检查

## 三、架构对比

```
Cursor Agent CLI (裸用):
  用户 → 手动 stdin → cursor agent acp → stdout → 手动解析

CursorClaw Bridge:
  飞书/Telegram → ChannelAdapter → BridgeController → CursorSessionManager
                                         │                    │
                                   Extension Events    CursorBridge (per scope)
                                   App Commands             │
                                   Stream Handle     cursor agent acp (stdio)
                                         │
                                   TaskScheduler (persistent)
                                   HookRunner (lifecycle)
                                   Memory System (MEMORY.md + daily)
```

## 四、CLI 不是缺陷，是设计边界

Cursor Agent CLI 的定位是 **底层协议接口**，类似于数据库的 wire protocol。它故意不包含 UI 层、通道层、持久化层 — 这些留给上层应用来做。

CursorClaw Bridge 就是这个"上层应用"。它在 CLI 之上构建了：

| 层 | 职责 | CLI 提供？ |
|----|------|-----------|
| 协议层 | JSON-RPC 2.0 over stdio | ✅ |
| 会话层 | 多用户隔离、Session 管理 | ❌ |
| 通道层 | Feishu/Telegram 适配 | ❌ |
| 流式层 | 平台感知的 streaming UI | ❌ |
| 事件层 | Extension event 路由 | ❌ |
| 指令层 | App-command 执行 + 定时任务 | ❌ |
| 感知层 | 时间注入、上下文管理 | ❌ |
| 安全层 | 白名单、Hook 拦截 | ❌ |
| 记忆层 | 持久化 memory + daily log | ❌ |
| 治理层 | Harness rules + skills + GC | ❌ |

## 五、对比 OpenClaw 的做法

OpenClaw 最新版本已经从 CLI subprocess 模式迁移到 **Pi SDK 嵌入式**模式：

```javascript
// OpenClaw: 直接 import SDK，进程内调用
import { createAgentSession } from '@mariozechner/pi-coding-agent';
const { session } = await createAgentSession({ ... });
await session.prompt("...");

// CursorClaw: spawn 子进程，stdio 通信
const child = spawn('cursor', ['agent', 'acp']);
child.stdin.write(JSON.stringify({ method: 'session/prompt', ... }));
```

嵌入式优势：
- 无 IPC 开销
- 直接访问 session 对象
- 更精细的 tool 注入和 system prompt 控制
- 更容易做 compaction 和 context pruning

CursorClaw 当前无法走嵌入式路线，因为 Cursor 没有公开 SDK。只能通过 CLI + ACP 协议。但这也意味着：
- **零依赖**：不需要 Cursor 内部包
- **版本解耦**：Cursor CLI 更新不影响 Bridge 核心逻辑（只要 ACP 协议不变）
- **灵活替换**：未来可以用同样的 Bridge 架构接 Claude Code 或其他 ACP 兼容 agent
