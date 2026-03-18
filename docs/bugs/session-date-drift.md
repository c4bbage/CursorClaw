# BUG: 长会话日期漂移 — 实际 3/18 却以为是 3/16

- **发现日期**: 2026-03-18（实际）
- **严重性**: P0
- **状态**: Open
- **影响**: 本次会话所有日期标注偏差 2 天，daily log 文件名错误，bug 文档日期错误

## 现象

- 用户于 3/18（周三）指出"今天是3月18日，为什么差别这么大"
- Agent 整个会话都以为今天是 3/16（周一）
- `date` 命令确认实际日期为 2026-03-18 21:43

## 实际时间线（根据文件 mtime 重建）

```
3/16 (周一)  09:45  文章部署、学习平台 docs 更新
             11:52  skills_web ROADMAP、learning-platform 前端更新
             13:41  CursorClaw cursor logs
             15:29  OpenClaw 安全指南部署
             17:10  reskin_web .env 更新

3/17 (周二)  14:42  CursorClaw cursor logs（有 Cursor 活动）
             20:29  MEMORY.md 和 2026-03-16.md 更新（本会话写入）
             20:31  learning-platform openclaw/meta.json 更新（本会话）

3/18 (周三)  17:40  CursorClaw cursor logs（本会话）
             17:42  openclaw-vs-cursorclaw.md 写入（本会话）
             21:38  docs/bugs/ 写入（本会话）
             21:40  2026-03-15.md 补写（本会话）
```

## 根因分析（多角度）

### 1. 直接原因：session_start 注入的静态日期

会话开始时 `user_info` 注入了：
```
Today's date: Monday Mar 16, 2026
```

这是**会话启动时的快照**，在整个会话生命周期内不会更新。Agent 一直信任这个值，从未用 `date` 命令验证。

### 2. 架构原因：长会话无日期刷新机制

CursorClaw 的 Cursor ACP 会话可以跨多天存活（通过 conversation summary 压缩上下文）。但：
- 没有 `session/update` 类型的日期刷新事件
- 没有 hook 在每次交互时注入当前时间
- Agent 的 rules/memory-protocol 里说"读取 today's file"，但 today 的定义来自静态注入

### 3. 认知原因：Agent 不验证假设

即使有 `date` 命令可用，Agent 没有**主动怀疑**日期是否过期的意识：
- rules 里没有"验证当前日期"的 checklist 项
- soul.mdc 里说"如果不确定就明确说明"，但 Agent 对日期没有"不确定感"
- 这是一种**过度信任系统注入信息**的模式

### 4. 对比 OpenClaw

OpenClaw 的做法：
- 每次 Agent turn 开始时，system prompt 动态拼接当前时间
- Memory flush 使用 `new Date()` 而不是 session-start 时间
- 日期是运行时获取的，不是 session-level 缓存的

## 影响范围

| 被错误影响的产物 | 错误日期 | 实际日期 | 需修正 |
|-----------------|---------|---------|--------|
| `memory/2026-03-16.md` 部分内容 | 标注 3/16 | 横跨 3/16~3/18 | 需拆分 |
| `memory/2026-03-15.md` 补写 | 标注补记 3/16 | 实际补记 3/18 | 已修正 |
| `memory/MEMORY.md` Strategic Direction | 标注隐含 3/16 | 实际 3/17~3/18 | 影响小 |
| `docs/bugs/*.md` 发现日期 | 标注 3/16 | 实际 3/18 | 需修正 |
| `docs/openclaw-vs-cursorclaw.md` 分析日期 | 标注 3/16 | 实际 3/18 | 需修正 |
| 今天(3/17, 3/18)没有 daily log | — | 缺失 | 需创建 |

## 修复方案

### 推荐方案：用户消息前缀注入（prompt cache 友好）

在 `cursor-bridge.js` 第 376 行，将时间戳注入到用户消息前缀而非 system prompt 或 hookContext：

```js
// cursor-bridge.js prompt() 方法
const timePrefix = `当前时间: ${new Date().toLocaleString('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'long'
})}`;
const systemPrompt = `${APP_COMMANDS_INSTRUCTIONS}${contextBlock}\n\n${timePrefix}\n\n用户消息：\n${message}`;
```

**Prompt cache 分析**：

| 注入位置 | Cache 影响 | 时间准确性 | 推荐 |
|---------|-----------|-----------|------|
| system prompt | 每次破坏整个 cache | 实时 | ✗ |
| hookContext 每次更新 | 破坏 context block cache | 实时 | ✗ |
| hookContext session 级 | 不破坏 cache | 会话内不变（老问题） | ✗ |
| **用户消息前缀** | **不破坏任何 cache** | **实时** | **✓** |
| Agent 自己跑 date | 不破坏 cache | 实时 | △ (浪费 tool call) |

原理：`APP_COMMANDS_INSTRUCTIONS + hookContext` 是静态前缀，全部可被 Cursor 侧缓存。
时间戳放在后面的用户消息区域，每次本来就不同，不增加 cache miss。

### 辅助方案：Agent rules 加入日期验证

在 `agents.mdc` Session Start Protocol 中加入：
```
5. Run `date` to verify current date — do NOT trust the session-start date
   if the conversation has been active for more than a few hours.
```

### 长期：BridgeController 日期感知

- 每次 inbound message 到达时，对比 session 创建日期和当前日期
- 如果跨日，触发 daily log 切分

## 预估工作量

- 推荐方案 (用户消息前缀)：15 分钟，改 1 行
- 辅助方案 (rules)：15 分钟
- 长期 (BridgeController 跨日)：2-4 小时

## 教训

> Agent 对系统注入的信息有天然的"过度信任"。
> 时间、身份、环境变量等**应该在使用时验证，而不是在注入时缓存**。
> 这不是 CursorClaw 特有的问题 — 任何长生命周期的 Agent 会话都可能遇到。
