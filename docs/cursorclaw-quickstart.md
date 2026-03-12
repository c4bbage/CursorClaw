# CursorClaw 快速上手指南

CursorClaw 是一套基于 Cursor 原生能力（Rules + Hooks + Memory）的 AI 助手增强系统。
安装后，你的 Cursor Agent 会获得**跨会话记忆、项目认知和个人风格**。

---

## 1. 前置要求

- [Cursor IDE](https://cursor.com/) 已安装
- 命令行可用 `jq`（hooks 依赖）
  ```bash
  # macOS
  brew install jq
  # Ubuntu/Debian
  sudo apt install jq
  ```

---

## 2. 两种安装方式

### 方式 A：项目级安装（推荐，团队共享）

把 CursorClaw 装进某个具体项目，该项目的所有 Cursor 会话都会生效。
适合团队协作——规则和长期记忆通过 git 共享。

```bash
cd /your/project
bash <(curl -fsSL https://raw.githubusercontent.com/c4bbage/CursorClaw/main/setup-claw.sh)
```

或者手动：

```bash
# 1. 下载 setup 脚本
curl -fsSL -o setup-claw.sh \
  https://raw.githubusercontent.com/c4bbage/CursorClaw/main/setup-claw.sh

# 2. 运行（默认安装到当前项目）
bash setup-claw.sh

# 3. 按提示完成个性化配置
```

安装后的目录结构：

```
your-project/
├── .cursor/
│   ├── hooks.json              # Hook 注册
│   ├── hooks/
│   │   ├── log-event.sh        # 事件日志
│   │   ├── session-memory.sh   # 启动注入记忆
│   │   └── session-summary.sh  # 结束写入摘要
│   └── rules/
│       ├── agents.mdc          # 操作指令
│       ├── soul.mdc            # 人格风格 ← 你来定制
│       ├── tools.mdc           # 工具备忘
│       └── memory-protocol.mdc # 记忆协议
├── memory/
│   ├── MEMORY.md               # 长期记忆
│   └── .gitkeep
```

### 方式 B：用户级安装（个人全局）

把 CursorClaw 装到 `~/.cursor/`，所有项目都会生效。
适合个人使用——你的 Claw 风格跟着你走。

```bash
bash setup-claw.sh --global
```

安装到：

```
~/.cursor/
├── hooks.json
├── hooks/
│   ├── log-event.sh
│   ├── session-memory.sh
│   └── session-summary.sh
└── rules/
    ├── agents.mdc
    ├── soul.mdc
    ├── tools.mdc
    └── memory-protocol.mdc

~/cursorclaw-memory/
├── MEMORY.md
└── .gitkeep
```

> **优先级**：项目级规则 > 用户级规则。
> 如果某个项目已有自己的 `.cursor/rules/`，项目规则会覆盖你的全局规则。

---

## 3. 设计你的个人风格

CursorClaw 的核心个性化文件是 **`soul.mdc`**。编辑它来定义你的 Claw 的性格。

### soul.mdc 模板

```yaml
---
description: Agent persona, tone, and behavioral boundaries
alwaysApply: true
---
```

下面是几种风格示例，选一个作为基础，然后改成你喜欢的样子：

### 风格 1：严谨工程师

```markdown
# Soul

## Identity
You are Claw, a senior systems engineer. Precision over speed.

## Tone
- Formal and precise. Every claim backed by evidence or code.
- Respond in English unless the user writes in another language.
- When uncertain, say "I'm not sure" rather than guessing.

## Boundaries
- Always verify assumptions with code search before making changes.
- Propose a plan before large refactors; get confirmation first.
- Never skip error handling — every catch must log context.
- Prefer explicit over clever: no ternary chains, no one-liner hacks.
```

### 风格 2：快速迭代者

```markdown
# Soul

## Identity
You are Claw, a rapid-prototyping partner. Ship fast, iterate faster.

## Tone
- Casual and energetic. Keep explanations short.
- Bilingual: match whatever language the user writes.
- Prefer showing code over describing code.

## Boundaries
- Bias toward action: if a task is clear, start coding immediately.
- Minimal boilerplate — only add what's needed right now.
- Tests for critical paths; skip tests for throwaway experiments.
- When stuck for more than 2 minutes, ask the user instead of guessing.
```

### 风格 3：教学导师

```markdown
# Soul

## Identity
You are Claw, a patient technical mentor. Help the user learn, not just do.

## Tone
- Explanatory and encouraging. Use analogies for complex concepts.
- Add "why" comments in code when teaching a pattern.
- Respond in the user's language.

## Boundaries
- Before writing code, explain the approach in 2-3 sentences.
- When the user makes a mistake, explain what went wrong and why.
- Offer alternatives: "Here's one way, but you could also..."
- Never do something the user could learn from doing themselves — guide first.
```

### 风格 4：中文技术助手

```markdown
# Soul

## 身份
你是 Claw，一个务实的技术搭档。用中文交流，代码注释用英文。

## 语气
- 简洁直接，不说废话。
- 用 bullet points 代替大段文字。
- 技术术语保留英文原文（如 "scopeKey"、"JSON-RPC"）。

## 边界
- 改代码前先读代码。
- 禁止 mock、禁止模拟——所有实现必须可运行。
- 输出里包含调试有用的信息（时间戳、ID、上下文）。
- 不确定的事情明确说"不确定"，不要猜。
```

### 自定义要点

| 维度 | 你需要决定的 |
|------|-------------|
| **语言** | 默认中文？英文？跟随用户？ |
| **详细度** | 简洁 vs 详细解释？ |
| **主动性** | 直接动手 vs 先确认？ |
| **风险偏好** | 快速尝试 vs 稳妥验证？ |
| **教学倾向** | 直接给答案 vs 引导思考？ |
| **代码风格** | 显式 vs 简洁？注释多 vs 少？ |

---

## 4. 定制项目知识

### agents.mdc — 项目概述

编辑 `.cursor/rules/agents.mdc` 中的 `## Project Overview` 部分，
写上你自己项目的架构说明：

```markdown
## Project Overview

my-app 是一个 Next.js 全栈应用，使用 Prisma + PostgreSQL。
主要模块：
- `src/app/` — Next.js App Router 页面
- `src/lib/` — 共享业务逻辑
- `src/components/` — React 组件库
- `prisma/` — 数据库 schema 和迁移
```

### tools.mdc — 工具备忘

写上你项目里的常见坑和约定：

```markdown
## Project-Specific Notes

- Prisma migrate 必须用 `npx prisma migrate dev`，不要用 `db push`。
- 环境变量从 `.env.local` 读取，不要硬编码。
- TailwindCSS v4 用 `@theme` 而不是 `tailwind.config.js`。
```

### memory/MEMORY.md — 长期记忆

种子化你的项目知识：

```markdown
# Project Memory

## Architecture
- Next.js 14 App Router + Server Components
- Database: PostgreSQL via Prisma ORM
- Auth: NextAuth.js with GitHub OAuth
- Deployed on Vercel

## Conventions
- All API routes in src/app/api/
- Use Zod for request validation
- Components use shadcn/ui
```

---

## 5. 验证安装

安装完成后，在 Cursor 里开一个新的 Agent 对话，发送：

```
你是谁？请简述你的记忆和能力。
```

如果 CursorClaw 工作正常，Agent 应该：
1. 知道自己的身份（来自 `soul.mdc`）
2. 了解项目背景（来自 `agents.mdc`）
3. 提到记忆系统（来自 `memory-protocol.mdc`）
4. 如果有 `MEMORY.md` 内容，能复述项目知识

检查 hooks 是否工作：

```bash
# 查看今天的日志
ls -la .cursor/logs/$(date +%Y-%m-%d)/

# 查看记忆文件
cat memory/$(date +%Y-%m-%d).md
```

---

## 6. 团队使用

### 共享规则（Git）

```bash
# 提交规则和 hooks（已经在 .gitignore 白名单里）
git add .cursor/rules/ .cursor/hooks/ .cursor/hooks.json memory/MEMORY.md
git commit -m "feat: add CursorClaw rules and memory system"
git push
```

团队成员 clone 后自动获得：
- 项目规则（agents, tools, memory-protocol）
- Hook 脚本（日志、记忆注入、摘要）
- 长期记忆（MEMORY.md）

### 个人覆盖

团队成员可以用**用户级规则**覆盖 soul.mdc 而不影响团队：

```bash
# 在 ~/.cursor/rules/ 创建你自己的 soul
mkdir -p ~/.cursor/rules
cat > ~/.cursor/rules/soul.mdc << 'EOF'
---
description: My personal Claw persona
alwaysApply: true
---

# Soul

## Identity
(你的个人风格...)
EOF
```

用户级 soul 会和项目级规则合并，不会冲突。

---

## 7. 常见问题

### Q: Hooks 没有触发？

1. 确认工作区被 Cursor 信任（首次打开会提示）
2. 确认脚本有执行权限：`chmod +x .cursor/hooks/*.sh`
3. 确认 `jq` 已安装：`which jq`
4. 查看 Cursor 的 Output panel → "Hooks" 频道看报错

### Q: 记忆文件越来越大怎么办？

- `MEMORY.md` 超过 200 行时，整理合并旧条目
- 每日日志 (`YYYY-MM-DD.md`) 是 gitignored 的，可以定期清理
- `session-memory.sh` 有 8000 字符截断保护

### Q: 能和 Claude Code (CLAUDE.md) 共存吗？

可以。Cursor 会同时读取 `.cursor/rules/*.mdc` 和 `CLAUDE.md`。
CursorClaw 的 rules 不会和 CLAUDE.md 冲突。如果你同时用
Claude Code，可以在 CLAUDE.md 里加一行指向 memory/：

```markdown
Read memory/MEMORY.md at session start for project context.
```

### Q: ACP Bridge 会话有记忆吗？

有，但机制不同：
- **IDE 会话**: Hooks 自动注入记忆（`additional_context`）
- **Bridge 会话**: Rules 指示 Agent 用 Read 工具手动读取 memory/

两条路径都能读写 memory/，数据是共享的。
