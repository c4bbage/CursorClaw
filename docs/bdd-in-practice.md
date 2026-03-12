# 当 16 个测试全绿，线上还是挂了 — 用 BDD 堵住集成项目的盲区

## 故事

我在做一个桥接项目：把飞书和 Telegram 的消息转发给 Cursor AI Agent，再把 Agent 的流式回复推回给用户。架构大致是：

```
飞书/Telegram → ChannelAdapter → BridgeController → CursorSessionManager → Cursor CLI (ACP)
```

项目有 16 个单元测试，全绿。然后用户在飞书里让 Agent clone 一个 GitHub 仓库，消息回了一半就卡死了。用户发了"进展"，又发了"卡死了！"，都石沉大海。

16 个测试，没有一个能拦住这个 bug。

## 诊断

翻日志发现了这一行：

```
[Cursor] Ignored message: {"jsonrpc":"2.0","id":30,"method":"_cursor/update_todos","params":{...}}
```

Cursor CLI 发来了 `_cursor/update_todos`（带下划线前缀），而我的代码只匹配 `cursor/`：

```javascript
if (msg.method?.startsWith('cursor/')) {
  this.emit('cursor_event', msg);
  return;
}
console.log('[Cursor] Ignored message:', JSON.stringify(msg));
```

`_cursor/update_todos` 有 `id: 30`，是一个 JSON-RPC request，必须返回 response。我没回，Cursor Agent 进程阻塞等待，后续所有文本生成停止。

## 为什么 16 个测试没拦住？

看看当时的测试长什么样：

```javascript
it('defaults mcpServers to an empty array', () => {
  const bridge = new CursorBridge({ cwd: '/tmp/example' });
  const params = bridge.buildSessionParams();
  assert.deepStrictEqual(params, { cwd: '/tmp/example', mcpServers: [] });
});
```

```javascript
it('builds ask_question responses from numeric selection', () => {
  const response = buildAskQuestionResponse(params, '1');
  assert.deepStrictEqual(response.result.answers[0].selectedOptionIds, ['opt-a']);
});
```

这些都是 **TDD 风格的测试**：给一个函数输入，检查输出。它们验证的是"这个函数的返回值对不对"，而不是"当 Cursor CLI 发来一个事件，系统应该怎么反应"。

这就是盲区。纯函数没问题，但 **bug 出在组件之间的交互边界**——Cursor CLI 发了什么、`handleMessage` 怎么路由、事件有没有到达 `BridgeController`、最终飞书用户有没有收到消息。这条链上的任何一环断了，用户就挂了，但没有任何测试在验证这条链。

## BDD 怎么写

BDD 的核心思想：**不要描述代码怎么工作，描述系统应该怎么反应。**

用自然语言先写行为：

> 当 Cursor CLI 发来 `_cursor/update_todos` 事件时，应该归一化为 `cursor/update_todos` 并转发给 BridgeController。

翻译成测试：

```javascript
describe('CursorBridge handles _cursor/ prefixed events', () => {
  it('should normalize _cursor/update_todos to cursor/update_todos and emit', () => {
    const bridge = new CursorBridge({ cwd: '/tmp' });
    const emitted = [];
    bridge.on('cursor_event', (event) => emitted.push(event));

    bridge.handleMessage({
      jsonrpc: '2.0',
      id: 30,
      method: '_cursor/update_todos',
      params: { todos: [{ id: '1', content: 'test', status: 'pending' }] }
    });

    assert.strictEqual(emitted.length, 1);
    assert.strictEqual(emitted[0].method, 'cursor/update_todos');
  });
});
```

关键区别：

| TDD 测试 | BDD 测试 |
|----------|----------|
| `buildSessionParams()` 返回 `{ cwd, mcpServers }` | 当 Cursor 发 `_cursor/update_todos`，飞书用户应收到 todos 推送 |
| 测试一个函数 | 测试一条行为链 |
| 验证返回值 | 验证系统反应 |
| 改实现可能要改测试 | 改实现不用改测试（行为不变的话） |

## 这个项目里 BDD 比 TDD 更合适的原因

### 1. Bug 全出在集成边界

回顾项目发现的所有 bug：

- `_cursor/update_todos` 前缀不匹配 → 组件间消息路由问题
- `updateChain` promise 断裂 → 流式回复的中间步骤失败影响最终步骤
- `sendFile` 上游返回 undefined → 外部 API 返回值假设错误
- Telegram 4096 字符超限 → 平台约束未处理

**没有一个是纯逻辑 bug。** 全都是"A 发了 X，B 应该做 Y，但没做"。

### 2. 外部依赖不可控

飞书 SDK、Telegram Bot API、Cursor CLI — 它们的行为你控制不了。Cursor CLI 的文档写的是 `cursor/update_todos`，实际发的是 `_cursor/update_todos`。你唯一能做的是在测试里模拟真实场景。

### 3. 用户感知就是行为

用户不关心 `buildSessionParams` 返回什么。用户关心的是：

- 我发了消息，Bot 有没有回？
- 回复是不是完整的？
- 长消息有没有被吞掉？

BDD 测试直接对齐用户感知。

## 实战：用 BDD 覆盖本项目的核心场景

### 场景 1：流式回复中间失败时最终消息仍应送达

```
Given: 用户发了一条消息
When:  Cursor 流式返回了 5 个 chunk，第 3 次 updateMessage 失败
Then:  最终完整回复仍应成功发送到飞书
```

### 场景 2：Telegram 长消息自动分段

```
Given: Cursor 返回了 8000 字符的回复
When:  通过 Telegram sendText 发送
Then:  消息应被拆成 2 条，每条不超过 4096 字符
```

### 场景 3：Markdown 渲染失败自动降级

```
Given: Cursor 回复包含不规范的 Markdown
When:  Telegram 的 HTML 解析模式拒绝了消息
Then:  应自动 fallback 到纯文本发送，用户不会看到错误
```

### 场景 4：未知 ACP 请求不阻塞 Agent

```
Given: Cursor CLI 发来一个未知方法的 JSON-RPC request（带 id）
When:  handleMessage 没有对应的处理逻辑
Then:  应自动返回 acknowledge，不阻塞 Agent 进程
```

以上四个场景，就是我们这轮修 bug 后新增的 BDD 测试的来源。

## 什么时候还是用 TDD

BDD 不是万能的。纯函数、数据变换、算法逻辑用 TDD 更直接：

```javascript
// 这种场景 TDD 更合适 — 输入明确，输出明确，没有副作用
it('parses a single app-commands block', () => {
  const result = parseAppResponse('hello ```app-commands\n{"commands":[]}\n```');
  assert.deepStrictEqual(result.commands, []);
  assert.strictEqual(result.visibleText, 'hello');
});
```

**判断标准：如果你能用"当…应该…"描述，用 BDD；如果你能用"输入 X，输出 Y"描述，用 TDD。**

这个项目的代码比例大概 70% 是集成胶水，30% 是纯函数，所以测试比例也应该是 **BDD 为主，TDD 为辅**。

## 总结

| | 不用 BDD | 用 BDD |
|---|---------|--------|
| 测试数量 | 16 个全绿 | 36 个全绿 |
| 能拦住 `_cursor/` bug？ | 不能 | 能 |
| 能拦住 `updateChain` 断裂？ | 不能 | 能 |
| 能拦住 Telegram 4096 超限？ | 不能 | 能 |
| 改了内部实现要改测试？ | 经常要 | 行为不变就不用 |
| 新人读测试能理解系统？ | 只能理解单个函数 | 能理解系统行为 |

16 个测试全绿，线上还是挂了。加了 20 个 BDD 测试后，覆盖了所有已知的集成边界。下次 Cursor CLI 再改前缀、飞书再限流、Telegram 再拒绝超长消息，测试会先告诉你。
