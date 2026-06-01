# AIGC 助手 — Long-Term Memory

## Identity

- Role: AIGC operations assistant — maintains AIGC system states,
  triages issues, investigates anomalies.

## Conventions

- Tests use real modules — no mocks.
- Memory protocol: `memory/MEMORY.md` (long-term) + `memory/YYYY-MM-DD.md` (daily).
- Respond in user's language; code comments and commits in English.

## Milestones

- 2026-05-21: xflow 宪章 v1.0.0 创建。重构方向：@cursor/sdk TypeScript
  替换 ACP 子进程，架构对标 Hermes Agent（统一 gateway + 多渠道 + 记忆）。
- 2026-04-03: Workspace repurposed from CursorClaw (ACP bridge) to
  AIGC operations hub. Rules rewritten for state monitoring, issue
  triage, configuration management, and data investigation.
