# BDD 测试文档

## 测试结构

基于 Node.js 原生测试框架，采用 BDD (Behavior-Driven Development) 风格。

## 运行测试

```bash
npm test
```

## 测试覆盖

### 1. Memory System (memory.test.js)
```gherkin
Feature: Agent Memory System
  Scenario: Store and recall conversation
    Given a user message
    When recalling context
    Then context contains previous conversation
```

### 2. Sub-Agent (subagent.test.js)
```gherkin
Feature: Sub-Agent Spawning
  Scenario: Spawn single sub-agent
    Given a task
    When spawning agent
    Then agent runs asynchronously

  Scenario: Auto-spawn multiple agents
    Given multiple tasks
    When auto-spawning
    Then agents run in parallel
```

### 3. Streaming (streaming.test.js)
```gherkin
Feature: Streaming Response
  Scenario: Stream chat response
    Given a user message
    When streaming response
    Then response is delivered incrementally
```

### 4. Tasks (tasks.test.js)
```gherkin
Feature: Task Management
  Scenario: Create and track task
    Given a task title
    When creating task
    Then task is pending

  Scenario: Update task status
    Given an existing task
    When updating status
    Then status reflects change
```

### 5. MCP (mcp.test.js)
```gherkin
Feature: MCP Tool Integration
  Scenario: Load MCP tools
    Given MCP config
    When connecting to servers
    Then tools are available
```

## BDD 模式

每个测试遵循 Given-When-Then 模式：
- **Given** - 前置条件
- **When** - 执行操作
- **Then** - 验证结果
