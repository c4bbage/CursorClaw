# ACP Bridge Hooks 兼容层

本文档说明 ACP 桥接（飞书 / Telegram → Cursor Agent CLI）如何兼容 Cursor IDE 的 `.cursor/hooks.json` 机制，实现同一套 hook 脚本在 IDE 和远程渠道下统一生效。

---

## 1. 背景

Cursor IDE 的 Hooks 系统提供了 20 个生命周期事件，用于观察、拦截和扩展 Agent 行为。但 `agent acp` 模式（headless CLI 通过 stdio 通信）不会触发这些 hooks——它只走 JSON-RPC 协议。

ACP Bridge 的 `HookRunner` 填补了这个空白：它读取项目中的 `.cursor/hooks.json`，在桥接代码的等效生命周期节点执行相同的脚本，传入与 Cursor IDE 完全一致的 JSON input/output schema。

---

## 2. 对齐矩阵

| # | Hook 事件 | ACP 信号源 | 对齐状态 | 能力 |
|---|---|---|---|---|
| 1 | `sessionStart` | `session/new` 完成后 | ✅ | `additional_context` 注入 + `env` 设置 |
| 2 | `sessionEnd` | ACP 进程 close | ✅ | `reason` + `duration_ms` |
| 3 | `preToolUse` | `session/request_permission` | ✅ | 可 **deny** → 拒绝工具执行 |
| 4 | `postToolUse` | `tool_call` update | ✅ | `tool_name` + `tool_input` + `additional_context` |
| 5 | `postToolUseFailure` | 无直接信号 | ⚠️ | 尽力而为（ACP 不暴露工具失败事件） |
| 6 | `subagentStart` | `cursor/task` 扩展事件 (running) | ✅ | 可 **deny** → 阻止子代理 |
| 7 | `subagentStop` | `cursor/task` 扩展事件 (completed) | ✅ | `followup_message` + `loop_limit` |
| 8 | `beforeShellExecution` | permission request (Shell) | ✅ | 可 **deny** → 拒绝命令 |
| 9 | `afterShellExecution` | `tool_call` (Shell) | ✅ | `command`（无 output，ACP 限制） |
| 10 | `beforeMCPExecution` | permission request (MCP:*) | ✅ | 可 **deny** → 拒绝 MCP 调用 |
| 11 | `afterMCPExecution` | `tool_call` (MCP) | ✅ | `tool_name` + `tool_input` |
| 12 | `beforeReadFile` | permission request (Read) | ✅ | 可 **deny** → 阻止文件读取 |
| 13 | `afterFileEdit` | `tool_call` (Write/StrReplace) | ✅ | `file_path` + `edits` |
| 14 | `beforeSubmitPrompt` | `prompt()` 入口前 | ✅ | 可 **block** → 拦截用户消息提交 |
| 15 | `preCompact` | ACP 不暴露 | ❌ | 无法实现 |
| 16 | `stop` | prompt 完成后 | ✅ | `followup_message` + `loop_limit` |
| 17 | `afterAgentResponse` | prompt 完成后 | ✅ | 完整 `text` |
| 18 | `afterAgentThought` | `agent_thought_chunk` 聚合 | ✅ | 聚合 `text` + `duration_ms` |
| 19 | `beforeTabFileRead` | N/A | — | Tab 专用，ACP 无内联补全 |
| 20 | `afterTabFileEdit` | N/A | — | Tab 专用，ACP 无内联补全 |

**对齐率：17/18 可用 Agent hooks（94%）**

---

## 3. 架构

```
Feishu / Telegram
      │
      ▼
ChannelAdapter ─── emitMessage() ───▶ BridgeController
                                           │
                                           ▼
                                    CursorSessionManager
                                           │
                                      ┌────┴────┐
                                      │         │
                                  HookRunner  CursorBridge
                                      │         │
                                      │    spawn('agent', ['acp'])
                                      │         │
                   .cursor/hooks.json │    stdio JSON-RPC
                   .cursor/hooks/*.sh │         │
                                      └────┬────┘
                                           │
                              ACP session lifecycle events
                              mapped to hook fire methods
```

### 数据流

1. **session 创建** → `HookRunner.fireSessionStart()` → `session-memory.sh` 返回 `additional_context` → 注入到第一个 prompt
2. **用户发消息** → `HookRunner.fireBeforeSubmitPrompt()` → 可 block → `session/prompt`
3. **工具需授权** → `session/request_permission` → `HookRunner.firePreToolUse()` + 分类 before hooks → 可 deny
4. **工具执行完成** → `tool_call` update → `HookRunner.firePostToolUse()` + 分类 after hooks
5. **思考完成** → `agent_thought_chunk` 聚合后 → `HookRunner.fireAfterAgentThought()`
6. **回复完成** → `HookRunner.fireAfterAgentResponse()` + `HookRunner.fireStop()`
7. **进程退出** → `HookRunner.fireSessionEnd()`

---

## 4. 工具分类映射

HookRunner 根据工具名自动将 `tool_call` 分流到对应的 hook：

| 工具名 | 分类 | Before Hook | After Hook |
|---|---|---|---|
| `Shell` | 命令执行 | `beforeShellExecution` | `afterShellExecution` |
| `Read`, `Glob`, `Grep`, `SemanticSearch` | 文件读取 | `beforeReadFile` | — |
| `Write`, `StrReplace`, `EditNotebook`, `Delete` | 文件编辑 | — | `afterFileEdit` |
| `MCP:*`, 包含 `/` 的工具名 | MCP 工具 | `beforeMCPExecution` | `afterMCPExecution` |
| `Task` | 子代理 | `subagentStart` | `subagentStop` |

所有工具都会额外触发通用的 `preToolUse` / `postToolUse`。

---

## 5. 与 IDE 的差异

| 特性 | Cursor IDE | ACP Bridge |
|---|---|---|
| hooks.json 加载 | 自动监听文件变化 | 进程启动时加载一次 |
| `preCompact` | 支持 | 不支持（ACP 不暴露） |
| Tab hooks | 支持 | 不适用 |
| `afterShellExecution.output` | 包含完整终端输出 | 空（ACP 不返回工具输出） |
| `afterFileEdit.edits` | 包含精确编辑内容 | 从 `tool_input` 推断（StrReplace 可用，Write 为空） |
| `postToolUseFailure` | 工具失败时可靠触发 | 尽力而为（ACP 无明确失败信号） |
| 环境变量 `CURSOR_VERSION` | 实际版本号 | `acp-bridge` |
| 环境变量 `CURSOR_TRANSCRIPT_PATH` | 指向 IDE transcript | `null` |

---

## 6. 配置

### 6.1 hooks.json

放在项目根目录下 `.cursor/hooks.json`，格式与 Cursor IDE 完全一致：

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": ".cursor/hooks/session-memory.sh" }
    ],
    "beforeShellExecution": [
      {
        "command": ".cursor/hooks/block-dangerous-cmd.sh",
        "matcher": "rm -rf|drop table",
        "failClosed": true
      }
    ],
    "stop": [
      {
        "command": ".cursor/hooks/session-summary.sh",
        "loop_limit": 5
      }
    ]
  }
}
```

完整示例见 `.cursor/hooks.json.example`。

### 6.2 Per-Script 配置项

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `command` | string | **必填** | 脚本路径，相对于项目根目录 |
| `timeout` | number | 30 | 超时秒数 |
| `matcher` | string | — | 正则过滤（按事件类型匹配不同字段） |
| `failClosed` | boolean | false | `true` 时脚本失败 = 拦截操作 |
| `loop_limit` | number | 5 | `stop` / `subagentStop` 的自动续跑上限 |

### 6.3 Matcher 规则

| Hook 事件 | Matcher 匹配字段 |
|---|---|
| `preToolUse` / `postToolUse` / `postToolUseFailure` | `tool_name` |
| `beforeShellExecution` / `afterShellExecution` | `command` 内容 |
| `subagentStart` / `subagentStop` | `subagent_type` |
| `beforeReadFile` | 工具名（默认 `Read`） |
| `afterFileEdit` | 工具名（默认 `Write`） |
| `stop` | 固定值 `Stop` |
| `afterAgentResponse` | 固定值 `AgentResponse` |
| `afterAgentThought` | 固定值 `AgentThought` |
| `beforeSubmitPrompt` | 固定值 `UserPromptSubmit` |

---

## 7. 编写 Hook 脚本

Hook 脚本通过 stdin 接收 JSON，通过 stdout 返回 JSON，与 Cursor IDE 的行为一致。

### 7.1 基本模板

```bash
#!/bin/bash
set -euo pipefail

# 读取 JSON input
INPUT=$(cat)

# 解析需要的字段
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name')
CONV_ID=$(echo "$INPUT" | jq -r '.conversation_id')

# 你的逻辑...

# 返回 JSON output
echo '{}'
exit 0
```

### 7.2 拦截操作（exit code 2 或 permission: deny）

```bash
#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.command // ""')

if echo "$COMMAND" | grep -qE 'rm -rf /|drop database'; then
  echo '{"permission": "deny", "user_message": "⛔ Dangerous command blocked"}'
  exit 0
fi

echo '{"permission": "allow"}'
exit 0
```

或者用 exit code 2 快速拦截：

```bash
#!/bin/bash
INPUT=$(cat)
# 检查不通过则 exit 2
exit 2
```

### 7.3 注入上下文（sessionStart）

```bash
#!/bin/bash
cat > /dev/null  # 消费 stdin
MEMORY=$(cat memory/MEMORY.md 2>/dev/null || echo "")
jq -n --arg ctx "$MEMORY" '{"additional_context": $ctx}'
exit 0
```

---

## 8. 调试

### 查看 hook 是否加载

启动日志会打印：

```
[HookRunner] Loaded hooks: sessionStart, stop, sessionEnd, ...
```

### 查看 hook 执行

每次 hook 执行会打印标准错误到进程日志：

```
[HookRunner] stderr (command): ...
[HookRunner] eventName hook error (command): ...
```

### 手动测试单个 hook

```bash
echo '{"hook_event_name":"sessionStart","conversation_id":"test"}' | \
  CURSOR_PROJECT_DIR=$(pwd) bash .cursor/hooks/session-memory.sh
```

---

## 9. 已有脚本说明

| 脚本 | 触发事件 | 功能 |
|---|---|---|
| `log-event.sh` | 多个 | 按 conversation_id 写 JSONL 日志到 `.cursor/logs/` |
| `session-memory.sh` | `sessionStart` | 读取 `memory/MEMORY.md` 和今日/昨日日志，注入为 `additional_context` |
| `session-summary.sh` | `stop` | 从 JSONL 日志提取摘要，追加到 `memory/<today>.md` |
