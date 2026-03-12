# 记忆系统架构

## OpenClaw 启发的设计

参考 OpenClaw 2026 年的记忆系统实现，采用混合搜索和文件优先的架构。

## 核心特性

### 1. 双层存储
- **JSONL** - 快速追加的日志（ephemeral memory）
- **Markdown** - 人类可读的持久化记忆（durable memory）

### 2. 混合搜索
- **向量搜索** - 语义相似度匹配
- **关键词搜索** - 精确文本匹配
- 结合两者提高召回准确率

### 3. 动态索引
- 使用 `chokidar` 监听 `.md` 文件变化
- 文件修改时自动重新索引
- 生成并更新向量 embedding

### 4. SQLite 向量存储
```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY,
  userId TEXT,
  content TEXT,
  embedding BLOB,
  ts INTEGER
);
```

## 工作流程

```
用户消息 → store()
    ↓
写入 JSONL + MD
    ↓
文件监听触发
    ↓
indexMarkdown()
    ↓
生成 embedding
    ↓
存入 SQLite
    ↓
recall() 混合查询
```

## 优势

- 透明性：Markdown 文件可直接编辑
- 实时性：文件变化自动索引
- 准确性：混合搜索提高召回
- 可扩展：支持版本控制（Git）

## Sources

- [OpenClaw Memory System](https://dev.to)
- [Vector Search in 2026](https://milvus.io)
- [Hybrid Search Best Practices](https://gitbook.io)
