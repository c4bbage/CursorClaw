# ACP Bridge 踩坑经验

本文档记录 Cursor ACP Bridge（Feishu / Telegram）开发过程中遇到的线上问题、根因分析和修复方案，供后续开发参考。

---

## 1. JavaScript Falsy 值陷阱（严重）

### 现象

- Telegram 对话中，agent 输出 todos 后整个会话卡死，不再产出任何内容。
- 5 分钟后超时返回残缺的部分回复。

### 根因

ACP 协议的 JSON-RPC 消息中，`id` 字段可以是 **任意值**，包括 `0`。但代码里用了 truthy 检查：

```javascript
// ❌ id=0 时 if(0) 为 false，ack 永远不会发出
if (event.id) {
  this.cursorSessions.respond(scopeKey, event.id, result);
}
```

同理，`result` 字段在 JSON-RPC 2.0 中可以是 `null`（合法的成功响应）：

```javascript
// ❌ result=null 时条件为 false，响应匹配不到 pending promise
if (msg.id && (msg.result || msg.error)) { ... }
```

### 修复

```javascript
// ✅ 用 != null 判断，0 和 null 都能正确处理
if (event.id != null) { ... }

// ✅ 用"有 id 且无 method"判断响应（请求一定有 method，响应一定没有）
const isResponse = msg.id != null && !msg.method;
```

### 教训

> **在 JSON-RPC / ACP 协议层，永远不要对 `id`、`result` 做 truthy 检查。**
> `0`、`null`、`""` 都是合法值。用 `!= null` 或结构判断（有无 `method`）。

---

## 2. `_cursor/` 前缀未识别导致 Agent 挂起

### 现象

让 agent 执行复杂任务（如 clone 仓库），消息回了一半就卡住。

### 根因

Cursor CLI 发送的扩展方法有两种前缀：`cursor/update_todos` 和 `_cursor/update_todos`。
Bridge 只匹配了 `cursor/` 前缀，`_cursor/` 的请求（带 `id`）被忽略，agent 阻塞等待响应。

### 修复

```javascript
const isCursorEvent = msg.method?.startsWith('cursor/') || msg.method?.startsWith('_cursor/');
if (isCursorEvent) {
  const normalizedMethod = msg.method.replace(/^_cursor\//, 'cursor/');
  // ...
}
```

加了兜底：任何未处理的带 `id` 请求自动 ack，防止未来新增方法再卡住 agent。

### 教训

> **ACP 扩展方法有 `cursor/` 和 `_cursor/` 两种前缀，必须同时识别。**
> 对未知的 JSON-RPC request（有 `id` + `method`）做兜底 ack，防止 agent 进程挂起。

---

## 3. 流式 updateChain 断裂导致消息不完整

### 现象

Feishu / Telegram 消息只回复了一半，后续内容丢失。

### 根因

流式更新使用 promise chain 串联：

```javascript
this.updateChain = this.updateChain.then(() => editMessage(...));
```

如果中间某次 `editMessage` 失败（如 Telegram 返回 "message is not modified"），整个 chain 断裂，
后续所有更新（包括最终的 `finalize`）都不会执行。

### 修复

在 chain 上加 `.catch()` 吞掉中间错误，保证 chain 不断：

```javascript
this.updateChain = this.updateChain
  .then(() => editMessage(...))
  .catch((error) => console.error('[Stream] Update failed:', error.message));
```

`finalize` 时如果 `replyMessageId` 为 null（初始回复就失败了），fallback 发新消息。

### 教训

> **Promise chain 里的 `.catch()` 不是可选的。** 中间任何一环的 reject 会导致后续所有 `.then()` 跳过。
> 对流式更新，必须在每一步 catch 错误并继续。

---

## 4. `agent_thought_chunk` vs `agent_message_chunk`

### 现象

Agent 执行工具调用时（读文件、跑命令），用户在 Telegram 看不到任何中间进展，感觉"卡住了"。

### 根因

ACP `session/update` 有多种 `sessionUpdate` 类型：

| 类型 | 含义 | 是否对用户可见 |
|------|------|----------------|
| `agent_message_chunk` | Agent 输出的正式文本 | ✅ 应该流式展示 |
| `agent_thought_chunk` | Agent 内部思考（类似 thinking） | ❌ 不展示，但可做活跃指示 |
| `tool_call` | Agent 发起工具调用 | ⚙️ 展示工具名作为状态 |
| `tool_call_update` | 工具执行进度 | 静默消费 |
| `available_commands_update` | 可用命令变更 | 静默消费 |

原代码只处理了 `agent_message_chunk`，其余全部静默丢弃，导致：
- 工具执行阶段用户看到长时间无更新
- 出问题时日志里也没有任何线索

### 修复

- `tool_call`：透传工具名到 stream handle，在消息末尾显示 `⚙️ toolName...`
- 非 chunk 类型：打日志但不输出到用户
- `agent_thought_chunk`：静默消费（内部推理，不适合展示给终端用户）

### 教训

> **处理 ACP `session/update` 时，必须覆盖所有 `sessionUpdate` 类型。**
> 至少要打日志，否则工具调用阶段完全是黑盒。

---

## 5. Telegram 平台特有限制

### 5.1 消息长度 4096 字符

Telegram `sendMessage` / `editMessageText` 有 4096 字符硬限制。超过直接报 API 错误，
如果发生在 stream chain 里，会触发 Bug 3（chain 断裂）。

**方案**：`truncateForTelegram()` 截断 + `splitMessage()` 分段发送。

### 5.2 Markdown → HTML

Telegram 不支持 GitHub Flavored Markdown，需要转换为 Telegram HTML：
- `**bold**` → `<b>bold</b>`
- `` `code` `` → `<code>code</code>`
- ```` ```block``` ```` → `<pre>block</pre>`
- `<`, `>`, `&` 需要 HTML 转义

**注意**：转换可能产生非法 HTML（如未闭合标签），必须 try/catch 并 fallback 到纯文本。

### 5.3 Typing 状态维持

Telegram `sendChatAction('typing')` 只持续约 5 秒。
Agent 执行长任务（subagent、工具调用）时如果不持续发送，typing 状态会消失，用户以为 bot 挂了。

**方案**：`setInterval` 每 4 秒发一次 typing，在 `finalize` 时清除。
注意：不要在中间 error 时就清除 typing，只在 `final=true` 的 error 里清除。

---

## 6. Prompt 超时与取消

### 现象

Agent 卡在工具调用里（如网络不通的 ES 查询），prompt 永远不返回，阻塞该 scope 的所有后续消息。

### 方案

- **超时**：`Promise.race([promptPromise, timeoutPromise])`，默认 5 分钟。超时后返回已收到的部分内容，并发送 `session/cancel`。
- **用户取消**：发送 `/cancel` 消息，bridge 调用 `session/cancel` 中断当前任务。

### 教训

> **任何外部调用都必须有超时。** ACP prompt 可能因为 agent 执行长任务、网络问题或协议错误而永远不返回。
> 给用户提供 `/cancel` 逃生通道。

---

## 7. `sendFile` 未校验导致 TypeError

### 现象

Agent 截图功能报错：`TypeError: Cannot read properties of undefined (reading 'file_key')`。

### 根因

`FeishuAdapter.sendFile()` 没有检查文件是否存在就调用 `createReadStream`，
也没有检查上传响应里的 `file_key` 是否为 undefined。

### 修复

```javascript
if (!fs.existsSync(filePath)) {
  throw new Error(`文件不存在: ${filePath}`);
}
// ...
const fileKey = res?.data?.file_key;
if (!fileKey) {
  throw new Error(`文件上传失败，飞书未返回 file_key: ${filePath}`);
}
```

### 教训

> **调用外部 API 后，永远校验返回值的关键字段。**
> 文件操作前先 `existsSync`，不要假设文件一定存在。

---

## 速查表：ACP Bridge 开发检查清单

| 检查项 | 说明 |
|--------|------|
| `id` 判断用 `!= null` | 不用 `if (id)` |
| `result` 判断用结构 | 不用 `if (result)` |
| `_cursor/` 和 `cursor/` 双前缀 | 统一 normalize |
| 未知 request 兜底 ack | 防止 agent 挂起 |
| Promise chain 加 `.catch()` | 防止断裂 |
| `session/update` 全类型覆盖 | 至少打日志 |
| 外部调用加超时 | prompt / API / 文件 |
| 平台限制处理 | 消息长度、格式转换、状态维持 |
| API 返回值校验 | 不假设结构正确 |
