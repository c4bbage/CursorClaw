# 完整 BDD 测试套件

## 测试覆盖（10 个测试文件）

### 1. memory.test.js
- Store and recall conversation
- 双层存储验证

### 2. subagent.test.js
- Spawn single sub-agent
- Auto-spawn multiple agents

### 3. streaming.test.js
- Stream chat response
- Incremental delivery

### 4. tasks.test.js
- Create and track task
- Update task status

### 5. mcp.test.js
- Load MCP tools

### 6. mcp-dynamic.test.js
- Add MCP server dynamically
- Remove MCP server

### 7. skills.test.js
- Load skills from directory
- Get specific skill

### 8. rules.test.js
- Add always rule
- Auto-attach by file type

### 9. hooks.test.js
- Register hook
- Trigger hook for memory update

### 10. feishu.test.js
- Receive message from Feishu
- Reply to message

### 11. e2e.test.js (NEW)
- Full conversation flow
- Proactive message sending

### 12. integration.test.js (NEW)
- Complete system integration
- All components working together

## 运行测试

```bash
npm test
```

## 测试场景

✅ 接收消息（被动）
✅ 主动发消息（主动）
✅ 流式响应
✅ 工具调用
✅ Sub-agent 生成
✅ 记忆更新
✅ Hooks 触发
