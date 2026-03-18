# 问题总览: 记忆系统脆弱性

- **发现日期**: 2026-03-18 (会话中误标为 3/16，见 session-date-drift.md)
- **状态**: Tracking

## 问题列表

| # | 问题 | 严重性 | Bug 文档 | 状态 |
|---|------|--------|----------|------|
| 1 | 长会话日期漂移（以为3/16实际3/18） | P0 | session-date-drift.md | Open |
| 2 | TaskScheduler 定时任务不持久化 | P0 | task-scheduler-no-persistence.md | Open |
| 3 | 跨日会话导致 daily log 缺失 | P1 | daily-log-cross-day-gap.md | Open |
| 4 | memory 无向量搜索能力 | P2 | (backlog) | Backlog |

## 发现过程

用户反馈"每日反思怎么两天没有了"，追溯发现：
- 定时任务因进程重启丢失（P0）
- 3/15 整天没有 daily log（P1）
- 两个问题叠加导致完全的"记忆断层"

## 根本原因

CursorClaw 的记忆系统目前完全依赖：
1. 手动触发（用户或 Agent 主动写入）
2. 定时任务触发（依赖不持久化的内存 cron）

没有任何**被动兜底**机制 — 一旦主动触发链断裂，记忆就中断。

## 对比 OpenClaw

| 机制 | OpenClaw | CursorClaw |
|------|----------|------------|
| 定时任务持久化 | openclaw.json, 启动恢复 | 内存 Map, 重启丢失 |
| 自动记忆 flush | compaction 前 silent turn | 无 |
| 向量记忆搜索 | BM25 + vector hybrid | 无 |
| Session 持久化 | JSONL + compaction | 进程级（重启丢失） |

## 修复优先级

```
Week 1:  [P0] TaskScheduler 持久化
Week 1:  [P1] session-start hook 兜底创建 daily log
Week 2+: [P2] 记忆向量化（Ollama 本地 embedding）
```

## 战略意义

这不只是一个技术 bug，而是 CursorClaw 从"工具期"向"分身期"演进的关键障碍。
一个会忘事的分身不是分身，是工具。记忆的可靠性是 Agent 信任度的基础。
