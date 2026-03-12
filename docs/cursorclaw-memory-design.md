# CursorClaw 记忆系统设计方案

本文档描述 CursorClaw 的记忆与认知架构——一套基于 Cursor 原生能力（Rules、Hooks、Agent）构建的项目级 AI 助手系统，设计灵感来自 OpenClaw 的 Agent Workspace 模式。

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| **跨会话连续性** | Agent 每次启动都是全新实例，但能通过文件系统"记住"之前的上下文 |
| **双通道共享** | IDE（Cursor Agent）和 Bridge（飞书 / Telegram ACP）共享同一套规则与记忆 |
| **项目级作用域** | 记忆绑定到项目而非用户，适合团队共享项目知识 |
| **透明可审计** | 所有认知状态都是纯文本 Markdown，可直接阅读和编辑 |
| **低 Token 开销** | Hook 自动注入 + 截断策略，避免每次会话手动读取大量文件 |

---

## 2. 架构总览

### OpenClaw → CursorClaw 映射

| OpenClaw 文件 | CursorClaw 对应 | 机制 |
|---------------|-----------------|------|
| `AGENTS.md` | `.cursor/rules/agents.mdc` | alwaysApply 规则 |
| `SOUL.md` + `IDENTITY.md` | `.cursor/rules/soul.mdc` | alwaysApply 规则 |
| `TOOLS.md` | `.cursor/rules/tools.mdc` | alwaysApply 规则 |
| `MEMORY.md` | `memory/MEMORY.md` | 长期记忆文件 |
| `memory/YYYY-MM-DD.md` | `memory/YYYY-MM-DD.md` | 每日会话日志 |
| `BOOT.md` | `session-memory.sh` hook | sessionStart 注入 |
| `HEARTBEAT.md` | `task-scheduler.js`（未来） | 定时任务 |

### 数据流

```
┌─────────────────────────────────────────────────────────┐
│                    会话启动                               │
│                                                         │
│  sessionStart hook                                      │
│  ┌──────────────────┐    ┌──────────────┐               │
│  │ log-event.sh     │    │ session-     │               │
│  │ (记录会话元数据)   │    │ memory.sh    │               │
│  └──────────────────┘    │ (注入记忆)    │               │
│                          └──────┬───────┘               │
│                                 │                       │
│                                 ▼                       │
│                    additional_context                    │
│              ┌──────────────────────────┐               │
│              │  MEMORY.md (长期)         │               │
│              │  today.md   (今日日志)    │               │
│              │  yesterday.md (昨日日志)  │               │
│              └──────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    会话进行中                             │
│                                                         │
│  .cursor/rules/*.mdc  ──→  Agent 行为约束               │
│  agents.mdc    (操作指令)                                │
│  soul.mdc      (人格边界)                                │
│  tools.mdc     (工具备忘)                                │
│  memory-protocol.mdc  (读写协议)                         │
│  bridge.mdc    (桥接架构, 仅 src/** 触发)                │
│                                                         │
│  afterAgentThought   ──→  log-event.sh (记录思考)       │
│  afterAgentResponse  ──→  log-event.sh (记录回复)       │
│  postToolUse         ──→  log-event.sh (记录工具调用)   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    会话结束                               │
│                                                         │
│  stop hook                                              │
│  ┌──────────────────────┐                               │
│  │ session-summary.sh   │                               │
│  │ (提取日志摘要,        │                               │
│  │  追加到 memory/       │                               │
│  │  YYYY-MM-DD.md)      │                               │
│  └──────────────────────┘                               │
│                                                         │
│  sessionEnd hook                                        │
│  ┌──────────────────┐                                   │
│  │ log-event.sh     │                                   │
│  │ (记录结束原因)    │                                   │
│  └──────────────────┘                                   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 目录结构

```
cursor_cloud/
├── .cursor/
│   ├── hooks.json                  # Hook 注册表
│   ├── hooks/
│   │   ├── log-event.sh            # 全事件 JSONL 日志（已有）
│   │   ├── session-memory.sh       # sessionStart: 注入记忆
│   │   └── session-summary.sh      # stop: 写入每日摘要
│   ├── rules/
│   │   ├── agents.mdc              # 操作指令（alwaysApply）
│   │   ├── soul.mdc                # 人格与边界（alwaysApply）
│   │   ├── tools.mdc               # 工具备忘（alwaysApply）
│   │   ├── memory-protocol.mdc     # 记忆读写协议（alwaysApply）
│   │   └── bridge.mdc              # 桥接架构（glob: src/**）
│   └── logs/                       # 详细 JSONL 日志（gitignored）
│       └── YYYY-MM-DD/
│           └── <conversation_id>/
│               ├── session.jsonl
│               ├── thoughts.jsonl
│               ├── responses.jsonl
│               └── tools.jsonl
├── memory/
│   ├── MEMORY.md                   # 长期记忆（git 跟踪）
│   ├── .gitkeep
│   └── YYYY-MM-DD.md              # 每日日志（gitignored）
└── docs/
    └── cursorclaw-memory-design.md # 本文档
```

### Git 策略

| 文件 | 是否跟踪 | 说明 |
|------|----------|------|
| `.cursor/rules/*.mdc` | 跟踪 | 团队共享的 Agent 规则 |
| `.cursor/hooks.json` | 跟踪 | Hook 注册配置 |
| `.cursor/hooks/*.sh` | 跟踪 | Hook 脚本 |
| `.cursor/logs/` | 忽略 | 本地调试日志，体积大 |
| `memory/MEMORY.md` | 跟踪 | 长期项目知识，团队共享 |
| `memory/.gitkeep` | 跟踪 | 保证目录存在 |
| `memory/YYYY-MM-DD.md` | 忽略 | 个人会话日志，短期有效 |

---

## 4. 记忆层级

### 4.1 长期记忆 — `memory/MEMORY.md`

**定位**: 持久化的项目知识库，相当于团队的"共识文档"。

**内容类型**:
- 架构决策（如 BridgeController + ChannelAdapter 分层）
- 已解决的 bug 类别（如 JSON-RPC falsy 值陷阱）
- 项目约定（如禁止 mock、`scopeKey` 格式）
- 里程碑事件

**维护规则**:
- 上限 200 行。超出时合并过时条目或迁移到 `docs/`。
- Agent 发现可复用的经验时主动更新。
- 版本控制，可通过 PR review 审核变更。

### 4.2 每日日志 — `memory/YYYY-MM-DD.md`

**定位**: 短期回忆缓冲区，为连续会话提供"昨天做了什么"的上下文。

**格式**:

```markdown
# 2026-03-12

## 14:30 Session (completed) — conv:57a07204
- Tools (12 calls): Read, Write, Shell, Grep
- Responses: 5 total
- Last: CursorClaw rules system has been fully implemented...

## 16:00 Session (completed) — conv:a1b2c3d4
- 修复了 Telegram typing keepalive 过早停止的问题
- 决定将 stream handle 的 catch 逻辑统一到基类
```

**写入方式**:
1. **自动**: `session-summary.sh` 在 `stop` hook 中从 JSONL 日志提取摘要并追加。
2. **手动**: Agent 根据 `memory-protocol.mdc` 中的写入协议，在重要节点主动写入。

**生命周期**: 不进 git。7 天内的日志是常规回忆范围；更早的日志仅在用户明确需要时读取。

### 4.3 详细日志 — `.cursor/logs/`

**定位**: 完整的会话录像，用于调试和回溯，不参与 Agent 的常规记忆流程。

**结构**: 按天 → 按 conversation_id 分目录，每个目录下有:
- `session.jsonl` — 会话生命周期（开始/结束）
- `thoughts.jsonl` — Agent 思考过程
- `responses.jsonl` — Agent 回复文本
- `tools.jsonl` — 工具调用记录

**写入方式**: `log-event.sh` 在 `sessionStart`、`sessionEnd`、`afterAgentThought`、`afterAgentResponse`、`postToolUse` 五个 hook 点自动记录。

---

## 5. Rules 系统设计

### 5.1 规则文件说明

所有规则使用 `.mdc` 格式（Markdown + YAML frontmatter），存放在 `.cursor/rules/`：

| 文件 | 激活模式 | OpenClaw 对应 | 职责 |
|------|----------|---------------|------|
| `agents.mdc` | alwaysApply | AGENTS.md | 会话协议、项目概述、安全默认值、写入协议 |
| `soul.mdc` | alwaysApply | SOUL.md + IDENTITY.md | 身份、语气、行为边界、工作风格 |
| `tools.mdc` | alwaysApply | TOOLS.md | ACP 踩坑备忘、SDK 使用注意、超时策略 |
| `memory-protocol.mdc` | alwaysApply | — | 记忆目录结构、读写协议、维护规则 |
| `bridge.mdc` | glob: `src/**` | — | 桥接数据流、Adapter 接口、流式模式、扩展事件 |

### 5.2 激活策略

- **alwaysApply**: 每次会话自动加载，无论打开什么文件。适用于全局行为约束。
- **glob 触发**: 仅在匹配文件被打开或编辑时加载。`bridge.mdc` 绑定到 `src/**`，只在开发桥接代码时提供详细架构信息，节省非桥接场景的 Token。

### 5.3 与 `.cursorrules` 的关系

旧的 `.cursorrules` 文件（包含 Lessons 和 Scratchpad）已被拆分并迁移：

| 旧内容 | 新位置 |
|--------|--------|
| User Specified Lessons | `soul.mdc` (Boundaries) + `agents.mdc` (Safety) |
| Project Lessons | `tools.mdc` (全部 ACP/SDK 备忘) |
| Scratchpad / Current Task | `memory/MEMORY.md` (Milestones) |
| Completion Notes | `memory/MEMORY.md` (Architecture) |

---

## 6. Hook 机制

### 6.1 Hook 注册表

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": ".cursor/hooks/log-event.sh" },
      { "command": ".cursor/hooks/session-memory.sh" }
    ],
    "stop": [
      { "command": ".cursor/hooks/session-summary.sh" }
    ],
    "sessionEnd": [
      { "command": ".cursor/hooks/log-event.sh" }
    ],
    "afterAgentThought": [
      { "command": ".cursor/hooks/log-event.sh" }
    ],
    "afterAgentResponse": [
      { "command": ".cursor/hooks/log-event.sh" }
    ],
    "postToolUse": [
      { "command": ".cursor/hooks/log-event.sh" }
    ]
  }
}
```

### 6.2 Hook 职责

#### `session-memory.sh` — 记忆注入

- **触发**: `sessionStart`
- **输入**: 会话元数据（session_id, model 等）
- **行为**: 读取 `memory/MEMORY.md`（前 3000 字符）+ 今日日志（后 3000 字符）+ 昨日日志（后 2000 字符），拼接后截断到 8000 字符上限
- **输出**: `{ "additional_context": "..." }` — Cursor 将其注入到会话的初始系统上下文中
- **降级**: 如果 memory 文件不存在，输出 `{}`，不影响会话启动

#### `session-summary.sh` — 会话摘要

- **触发**: `stop`（Agent 循环结束时）
- **输入**: `{ "status": "completed|aborted|error", "conversation_id": "..." }`
- **行为**: 从 `.cursor/logs/<today>/<conv_id>/` 读取 JSONL 日志，提取工具调用统计、回复数量、最后一条回复摘要
- **输出**: 追加到 `memory/<today>.md`，格式为 `## HH:MM Session (status) — conv:<id>`
- **降级**: 如果日志目录不存在（如 ACP bridge 会话），输出 `{}`

#### `log-event.sh` — 全事件记录

- **触发**: `sessionStart`、`sessionEnd`、`afterAgentThought`、`afterAgentResponse`、`postToolUse`
- **行为**: 根据 `hook_event_name` 分发到对应 JSONL 文件
- **输出目录**: `.cursor/logs/<YYYY-MM-DD>/<conversation_id>/`

---

## 7. IDE 与 Bridge 双通道

CursorClaw 的核心设计原则是 **rules-first**：所有行为通过 `.cursor/rules/*.mdc` 定义，hooks 仅作为优化层。

### IDE 路径（Cursor Agent in IDE）

```
会话启动
  ├── .cursor/rules/*.mdc 自动加载   → Agent 获得操作指令 + 人格 + 记忆协议
  ├── session-memory.sh hook 触发    → additional_context 注入记忆内容
  └── Agent 无需手动读取 memory/     → 直接开始工作

会话进行
  ├── log-event.sh 持续记录          → JSONL 详细日志
  └── Agent 按 memory-protocol 写入  → 重要发现写入 memory/

会话结束
  ├── session-summary.sh 自动摘要    → 追加到 memory/<today>.md
  └── log-event.sh 记录结束          → JSONL 关闭
```

### Bridge 路径（ACP via 飞书 / Telegram）

```
消息到达
  ├── ChannelAdapter.emitMessage()
  ├── BridgeController.handleMessage()
  └── CursorSessionManager.prompt()
        └── CursorBridge.start() → spawn('agent', ['acp'])
              └── .cursor/rules/*.mdc 从项目目录加载

会话进行
  ├── Rules 指示 Agent 读取 memory/  → Agent 通过 Read 工具读取
  └── Agent 按 memory-protocol 写入  → Agent 通过 Write 工具写入

会话结束
  └── (hooks 不一定触发于 ACP 会话，摘要依赖 Agent 主动写入)
```

**关键差异**: Bridge 路径中 hooks 可能不触发，因此 `agents.mdc` 的 Session Start Protocol 明确要求 Agent 手动读取 memory 文件。这保证了无论通过哪个通道，Agent 都能获得记忆上下文。

---

## 8. Token 预算

| 组件 | 估算 Token | 加载时机 |
|------|-----------|----------|
| `agents.mdc` | ~600 | 每次会话 |
| `soul.mdc` | ~350 | 每次会话 |
| `tools.mdc` | ~450 | 每次会话 |
| `memory-protocol.mdc` | ~500 | 每次会话 |
| `bridge.mdc` | ~700 | 仅触碰 `src/**` 时 |
| `session-memory.sh` 注入 | ~3000（上限 8000 字符） | 每次会话 |
| **合计（非桥接场景）** | **~4900** | — |
| **合计（桥接开发场景）** | **~5600** | — |

OpenClaw 官方建议 `bootstrapMaxChars` 默认 20000，我们的方案约为其 1/4，token 开销可控。

---

## 9. 未来扩展

| 方向 | 说明 |
|------|------|
| **用户级记忆** | 新增 `memory/users/<userKey>.md`，记录用户偏好和历史 |
| **Heartbeat** | 利用 `task-scheduler.js` 实现定时记忆整理和检查 |
| **记忆搜索** | 当日志积累后，提供按关键词检索历史记忆的 app-command |
| **自动整理** | `preCompact` hook 在上下文窗口压缩前提取关键信息到 memory |
| **Bridge 会话摘要** | 在 `BridgeController` 层面实现类似 `session-summary.sh` 的逻辑 |
