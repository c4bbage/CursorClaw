# BUG: 跨日会话导致 daily log 缺失

- **发现日期**: 2026-03-18 (会话中误标为 3/16，见 session-date-drift.md)
- **严重性**: P1
- **状态**: Open
- **影响**: 3/15 整天没有 daily log，回溯困难

## 现象

- 2026-03-15 有实际工作产出（leader-comm-framework.md 等）
- 但 `memory/2026-03-15.md` 不存在
- 工作记录全部堆到了 3/16 的 log 里

## 根因

三个因素叠加：

1. **定时反思任务丢失** — TaskScheduler 纯内存，进程重启后 cron 消失（见 task-scheduler-no-persistence.md）
2. **跨日会话不切分** — 会话跨越 3/15 和 3/16，写入时间戳统一归到 3/16
3. **没有自动兜底** — 当 cron 失效时，没有其他机制保证 daily log 被创建

## 修复方案

### 短期：修复 TaskScheduler 持久化

解决根本问题，定时反思不再丢失。见 `task-scheduler-no-persistence.md`。

### 中期：session-start hook 自动创建 daily log

在 `session-memory.sh` hook 中加入逻辑：
- 检查今天的 daily log 是否存在
- 如果不存在，创建空模板
- Agent 在 session start 时自然会看到空模板，提醒自己填写

### 长期：跨日 session 自动切分

当检测到日期变更时（如 23:59 → 00:01），自动：
1. 将当前上下文 flush 到昨天的 daily log
2. 创建新的 daily log
3. 在新 log 中标注"承接昨日 session"

## 预估工作量

- 短期（TaskScheduler）：4h
- 中期（hook 兜底）：1h
- 长期（跨日切分）：需要在 BridgeController 加日期检测逻辑，约 4h

## 关联

- 依赖 task-scheduler-no-persistence.md 的修复
- 参考 OpenClaw: compaction 前自动 flush 记忆的设计
