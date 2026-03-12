# 飞书 Bot 测试指南

## 测试方式

### 1. 单元测试（Mock）
```bash
npm test
```
使用 EventEmitter 模拟飞书消息事件。

### 2. 集成测试（真实环境）

**前置条件：**
1. 创建飞书应用
2. 获取 App ID 和 App Secret
3. 配置事件订阅 URL
4. 订阅 `im.message.receive_v1` 事件

**配置 .env：**
```bash
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
ANTHROPIC_API_KEY=sk-xxx
```

**启动服务：**
```bash
npm start
```

**测试步骤：**
1. 在飞书中找到你的 Bot
2. 发送消息："你好"
3. 观察 Bot 回复
4. 发送："创建任务：实现登录"
5. 验证任务创建

### 3. WebSocket 测试

**连接：**
```javascript
const ws = new WebSocket('ws://localhost:8080');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.send(JSON.stringify({ content: 'test', userId: 'user1' }));
```

**验证流式响应：**
- 收到 `type: 'chunk'` 消息
- 收到 `type: 'done'` 消息
