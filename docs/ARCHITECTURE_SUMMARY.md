# Cursor Claw 架构总结

## 已实现核心系统

### 1. 并行 Agent 系统
- **SubAgentScheduler**: Worker threads 进程隔离
- **任务队列**: 最大并发控制
- **Token 预算**: 智能资源管理
- **超时控制**: 5分钟自动终止

### 2. 记忆系统
- **向量数据库**: hnswlib + OpenAI embeddings
- **分层记忆**: 工作记忆 / 短期 / 长期
- **语义搜索**: Cosine similarity

### 3. 监控系统
- **Prometheus**: Counter, Histogram, Gauge
- **结构化日志**: Pino
- **告警管理**: 错误率、响应时间、Token 预算

### 4. 动态引擎
- **Rules**: 条件匹配 + 热重载
- **Skills**: 文件监听 + 自动更新
- **Hooks**: 事件总线 + 错误隔离

### 5. 生产基础设施
- **PostgreSQL**: 对话和 Agent 运行持久化
- **Redis**: 缓存层
- **RabbitMQ**: 异步任务队列
- **JWT**: 认证系统
- **Rate Limiter**: 速率控制

## 架构图

```
┌─────────────────────────────────────────┐
│         Feishu WebSocket                │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│     Main Agent (CursorClaw)             │
│  ┌────────────────────────────────────┐ │
│  │ LayeredMemory (工作/短期/长期)    │ │
│  │ DynamicRules (条件匹配)           │ │
│  │ HotReloadSkills (热加载)         │ │
│  │ EventBusHooks (事件总线)         │ │
│  │ PrometheusMonitor (监控)         │ │
│  │ AlertManager (告警)              │ │
│  └────────────────────────────────────┘ │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌─────▼────────┐
│SubAgent     │  │SubAgent      │
│Scheduler    │  │Worker Thread │
│(队列+预算)  │  │(独立进程)    │
└─────────────┘  └──────────────┘
       │
┌──────▼──────────────────────────────────┐
│  Infrastructure Layer                   │
│  - PostgreSQL (持久化)                  │
│  - Redis (缓存)                         │
│  - RabbitMQ (队列)                      │
│  - JWT Auth (认证)                      │
└─────────────────────────────────────────┘
```

## 技术栈

- **Runtime**: Node.js 24+ (ESM)
- **AI**: Claude Opus 4.6
- **Vector**: hnswlib-node + OpenAI embeddings
- **Monitoring**: Prometheus + Pino
- **Database**: PostgreSQL
- **Cache**: Redis
- **Queue**: RabbitMQ
- **Auth**: JWT

## 完成度：75%

### ✅ 已完成
- 核心 Agent 系统
- 并行执行框架
- 向量记忆系统
- 监控和告警
- 动态配置引擎
- 基础设施组件

### 🚧 待集成
- 将新组件集成到主系统
- 端到端测试
- 性能调优
- 部署配置

## 与 OpenClaw 对比

| 特性 | Cursor Claw | OpenClaw |
|------|-------------|----------|
| Agent 并行 | ✅ Worker threads | ✅ 进程池 |
| 记忆系统 | ✅ 向量 + 分层 | ✅ 向量数据库 |
| 监控 | ✅ Prometheus | ✅ 自定义 |
| 动态配置 | ✅ 热重载 | ✅ 配置中心 |
| 生产就绪 | 🚧 75% | ✅ 100% |

## 下一步

1. **集成新组件** (1周)
2. **压力测试** (3天)
3. **文档完善** (2天)
4. **部署脚本** (2天)
