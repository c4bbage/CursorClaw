# 系统架构整合

基于 Cursor 的完整概念体系：

## 核心组件映射

### 1. Rules - 定义灵魂
存储在 `.cursor/rules/` 目录，定义 Agent 的行为准则和约束。

**类型：**
- Always - 持续应用
- Auto Attached - 特定文件类型触发
- Agent Requested - AI 自主决定
- Manual - 手动调用

### 2. Skills - 定义技能
存储在 `SKILL.md` 文件，提供动态的领域知识和工作流。

**特点：**
- 程序化的 "how-to" 指令
- 可跨工具移植
- 动态上下文发现

### 3. MCP - 定义工具
Model Context Protocol 提供外部工具集成。

**功能：**
- 文件系统操作
- API 调用
- 数据库查询
- 动态添加/删除服务器

### 4. Subagents - 定义身份
专门化的独立 AI 助手，并行执行任务。

**优势：**
- 任务分解
- 并行执行
- 独立上下文

### 5. ACP - 通信协议
Agent Client Protocol 用于与外部系统（如飞书）通信。

**传输：**
- stdio + JSON-RPC 2.0
- 会话管理
- 工具权限控制

## 实现映射

```
Rules → src/rules/
Skills → src/skills/
MCP → src/mcp.js
Subagents → agent.spawnAgent()
ACP → 飞书/WebSocket 适配器
```
