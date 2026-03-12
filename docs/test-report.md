# BDD 测试完整报告

## 测试覆盖

### ✅ 1. Memory System
- Store and recall conversation
- 双层存储（JSONL + Markdown）
- 文件监听动态索引

### ✅ 2. Sub-Agent
- Spawn single sub-agent
- Auto-spawn multiple agents
- 并行执行验证

### ✅ 3. Streaming
- Stream chat response
- 增量交付验证

### ✅ 4. Tasks
- Create and track task
- Update task status

### ✅ 5. MCP
- Load MCP tools
- Dynamic add/remove servers

### ✅ 6. Skills (NEW)
- Load skills from directory
- Get specific skill content

### ✅ 7. Rules (NEW)
- Add always rule
- Auto-attach by file type

### ✅ 8. Feishu Bot (NEW)
- Receive message event
- Reply to message

## 运行测试

```bash
npm test
```

## 飞书 Bot 真实测试

已配置：
- App ID: `cli_a9f007e011785bcc`
- App Secret: 已设置

启动服务：
```bash
npm start
```

在飞书中测试：
1. 发送消息给 Bot
2. 验证流式响应
3. 测试任务创建
4. 测试 sub-agent 生成
