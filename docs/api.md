# API 文档

## WebSocket API

### 连接
```javascript
const ws = new WebSocket('ws://localhost:8080');
```

### 发送消息
```json
{
  "content": "帮我创建一个任务",
  "userId": "user123"
}
```

### 接收响应
```json
{
  "type": "response",
  "data": "已创建任务 #1"
}
```

## Agent 工具

### execute_command
执行 Shell 命令
```json
{
  "name": "execute_command",
  "input": { "cmd": "ls -la" }
}
```

### create_task
创建任务
```json
{
  "name": "create_task",
  "input": { "title": "实现登录功能" }
}
```

### spawn_agent
生成并行 Agent
```json
{
  "name": "spawn_agent",
  "input": { "task": "分析代码质量" }
}
```

## 飞书配置

1. 创建飞书应用
2. 获取 App ID 和 App Secret
3. 配置事件订阅：`im.message.receive_v1`
4. 填入 `.env` 文件
