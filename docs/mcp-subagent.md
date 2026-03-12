# MCP 集成与自主 Sub-Agent

## MCP 工具集成

### 配置 mcp.json
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"]
    }
  }
}
```

### 自动发现工具
Agent 启动时自动连接 MCP 服务器并加载所有工具。

## 流式响应

```javascript
for await (const chunk of agent.chatStream(message, userId)) {
  console.log(chunk); // 实时输出
}
```

## 自主 Sub-Agent

### spawn_agent
单个任务生成 sub-agent：
```json
{
  "name": "spawn_agent",
  "input": { "task": "分析代码" }
}
```

### auto_spawn
批量并行生成：
```json
{
  "name": "auto_spawn",
  "input": {
    "tasks": ["任务1", "任务2", "任务3"]
  }
}
```

Agent 可自主决定何时并行执行任务。

## 工作流

```
用户消息
  ↓
chatStream() 流式响应
  ↓
检测到复杂任务
  ↓
auto_spawn([子任务])
  ↓
并行执行 sub-agents
  ↓
汇总结果返回
```
