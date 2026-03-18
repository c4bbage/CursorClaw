# BUG: TaskScheduler 定时任务不持久化

- **发现日期**: 2026-03-18 (会话中误标为 3/16，见 session-date-drift.md)
- **严重性**: P0
- **状态**: Open
- **影响**: 所有通过 `schedule_task` 创建的定时任务（如每日反思）在进程重启后丢失

## 现象

- 用户通过对话创建了"每日反思"定时任务
- 某次进程重启后，任务消失，不再触发
- 用户发现"每日反思怎么两天没有了"

## 根因

`src/task-scheduler.js` 使用 `new Map()` 纯内存存储任务：

```js
constructor() {
  super();
  this.tasks = new Map();  // 进程重启 = 全部丢失
}
```

没有任何持久化机制 — 不写文件、不写数据库。

## 影响范围

- 所有通过 `schedule_task` app-command 创建的定时任务
- 飞书和 Telegram 两个通道都受影响
- 包括：每日反思、定时新闻摘要、定期提醒等

## 修复方案

### 方案 A：文件持久化（推荐）

1. 新增 `data/tasks.json` 存储任务配置
2. `schedule()` 和 `cancel()` 时同步写入文件
3. 构造函数中从文件加载并恢复所有 cron job
4. 需要同时存储 `scopeKey` + `prompt`（当前只存在闭包里）

```
data/tasks.json 结构：
{
  "telegram:chat123:user456:daily-reflect": {
    "taskId": "daily-reflect",
    "scopeKey": "telegram:chat123:user456",
    "cron": "0 22 * * *",
    "prompt": "反思今天做了什么...",
    "createdAt": "2026-03-10T10:00:00Z"
  }
}
```

### 方案 B：SQLite（过度）

对当前规模来说不必要。

### 实现要点

- `TaskScheduler` 构造函数接受 `persistPath` 参数
- 启动时需要 `cursorSessions` 和 `channelAdapter` 引用才能恢复 callback
- 考虑延迟恢复：等 adapter `start()` 完成后再恢复任务
- 恢复时需要 `context.target` 信息（用于发送消息）

## 预估工作量

- 半天（4h）

## 关联

- 参考 OpenClaw 实现：任务配置写入 `openclaw.json`，Gateway 启动时自动恢复
- 详见 `docs/openclaw-vs-cursorclaw.md` 工具生态差距分析
