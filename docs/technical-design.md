# Cursor Claw 技术方案

## 1. 架构概述

基于 Cursor/Claude Code 的真实实现，构建企业级 AI Agent 系统。

### 1.1 核心组件

```
┌─────────────────────────────────────────┐
│           Feishu Gateway                │
│         (WebSocket 长连接)              │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│        Main Agent (Orchestrator)        │
│  - Rules (灵魂)                         │
│  - Skills (技能)                        │
│  - Memory (记忆)                        │
│  - Hooks (经验积累)                     │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┬─────────┐
       │                │         │
┌──────▼──────┐  ┌─────▼────┐  ┌▼────────┐
│  Sub-Agent  │  │Sub-Agent │  │Sub-Agent│
│  (独立上下文)│  │(并行执行)│  │(专门化) │
└──────┬──────┘  └─────┬────┘  └┬────────┘
       │                │         │
       └────────┬───────┴─────────┘
                │
        ┌───────▼────────┐
        │  File System   │
        │  (结果传递)    │
        └────────────────┘
```

## 2. Sub-Agent 正确实现

### 2.1 当前问题
- ❌ 使用 tool 方式实现
- ❌ 没有独立上下文
- ❌ 结果直接返回字符串

### 2.2 正确方式

**不使用 tool，使用独立 Agent 实例：**

```javascript
// 错误方式（当前）
tools: [{ name: 'spawn_agent', ... }]

// 正确方式
class SubAgent {
  constructor(task, parentId) {
    this.client = new Anthropic({ apiKey });
    this.context = []; // 独立上下文
    this.workDir = `./agents/${parentId}/${Date.now()}`;
  }

  async execute() {
    // 独立执行
    const result = await this.client.messages.create({...});
    // 写入文件
    await writeFile(`${this.workDir}/result.md`, result);
    return this.workDir;
  }
}
```

### 2.3 通信机制

**文件系统通信：**
```
agents/
  └── parent-123/
      ├── task.md          # 任务描述
      ├── subagent-1/
      │   └── result.md    # 结果
      └── subagent-2/
          └── result.md
```

## 3. 组件详细设计

### 3.1 Rules (灵魂)

**定义 Agent 行为准则**

```markdown
# .cursor/rules/always.md
- 代码质量优先
- 安全第一
- 性能优化
```

**类型：**
- Always - 持续应用
- Auto - 文件类型触发
- Manual - 手动调用

### 3.2 Skills (技能)

**动态领域知识**

```markdown
# skills/code-review.md
## Purpose
代码审查

## Steps
1. 读取文件
2. 检查安全性
3. 生成报告
```

### 3.3 MCP (工具)

**外部能力集成**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"]
    }
  }
}
```

**动态管理：**
- `mcp.addServer(name, config)`
- `mcp.removeServer(name)`

### 3.4 Memory (记忆)

**双层存储 + 动态索引**

```
memory/
  ├── user1.jsonl      # 快速日志
  ├── user1.md         # 人类可读
  └── memory.db        # 向量索引（可选）
```

**Hooks 自动更新：**
- afterResponse → 存储对话
- afterToolUse → 记录经验

### 3.5 Hooks (经验积累)

**生命周期事件**

```javascript
hooks.register('afterResponse', async (data) => {
  await memory.store(data.userId, data.query, data.response);
});
```

**事件类型：**
- afterResponse
- afterToolUse
- beforeSpawn

## 4. 飞书集成

### 4.1 WebSocket 长连接

```javascript
const wsClient = new WSClient({ appId, appSecret });
wsClient.start({ eventDispatcher });
```

**优势：**
- 无需公网 IP
- 实时双向通信
- 自动重连

### 4.2 流式响应

```javascript
for await (const chunk of agent.chatStream(message)) {
  await feishu.reply(messageId, chunk);
}
```

## 5. 实现路线图

### Phase 1: 修复 Sub-Agent ✅
- [ ] 移除 spawn_agent tool
- [ ] 实现独立 Agent 类
- [ ] 文件系统通信
- [ ] 前台/后台模式

### Phase 2: 优化工具调用 ✅
- [ ] 修复 execute_command
- [ ] 完善错误处理
- [ ] 添加工具日志

### Phase 3: 增强记忆系统
- [ ] 向量搜索（可选）
- [ ] 语义召回
- [ ] 经验总结

### Phase 4: 生产就绪
- [ ] 错误恢复
- [ ] 性能优化
- [ ] 监控告警

## 6. 技术栈

- **Runtime**: Node.js 24+
- **AI**: Claude Opus 4.6
- **Protocol**:
  - ACP (Agent Client Protocol)
  - MCP (Model Context Protocol)
- **Communication**:
  - Feishu WebSocket
  - WebSocket (ws://localhost:8080)
- **Storage**:
  - JSONL (日志)
  - Markdown (人类可读)
  - SQLite (可选向量)

## 7. 安全考虑

- API Key 环境变量
- 命令执行沙箱
- MCP 工具权限控制
- 敏感信息过滤
