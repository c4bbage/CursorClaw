# ACP

## 概述

光标CLI支持**ACP（代理客户端协议）**进行高级集成。你可以用 JSON-RPC 运行并连接自定义客户端。`agent acp``stdio`

了解更多内容请参阅官方[代理客户端协议文档](https://agentclientprotocol.com/)。

ACP 旨在构建自定义客户端和集成。对于普通终端
工作流，使用带有 的交互式 CLI 。`agent`

## 启动ACP服务器

以ACP模式启动光标CLI：

```
agent acp
```

## 传输与消息格式

- 交通：`stdio`
- 协议包络：JSON-RPC 2.0
- 帧处理：换行分隔的JSON（每行一条消息）
- 导演：
- 客户端写入请求/通知`stdin`
- 光标CLI会写入响应/通知`stdout`
- 日志可以写入`stderr`

## 请求流程

典型的ACP会话流程：

1. `initialize`
2. `authenticate`其中`methodId: "cursor_login"`
3. `session/new`（或`session/load`)
4. `session/prompt`
5. 在模型输出时处理通知`session/update`
6. 通过返回判决来处理`session/request_permission`
7. 可选发送`session/cancel`

## 认证

光标CLI宣传为ACP认证方法。实际上，你可以在启动前使用现有的CLI认证路径进行预认证：`cursor_login`

- `agent login`
- `--api-key`（或`CURSOR_API_KEY`)
- `--auth-token`（或`CURSOR_AUTH_TOKEN`)

你也可以通过根CLI命令传递端点和TLS选项：

```
agent --api-key "$CURSOR_API_KEY" acp
agent -e https://api2.cursor.sh acp
agent -k acp
```

## 会话、模式与权限

### 录音

- 创建一个会话`session/new`
- 继续进行现有的对话`session/load`

### 模式

ACP 会话支持与 CLI 相同的核心模式：

- `agent`（完整工具访问）
- `plan`（计划，只读行为）
- `ask`（问答/只读行为）

### 权限

当工具需要批准时，光标发送 。客户应退回以下其中一项：`session/request_permission`

- `allow-once`
- `allow-always`
- `reject-once`

如果客户端不回复权限请求，工具执行可能会被阻塞。

## 光标扩展方法

Cursor 还会发送 ACP 扩展方法以实现更丰富的客户端用户体验：

方法用途`cursor/ask_question`向用户提问选择题`cursor/create_plan`请求明确的计划批准`cursor/update_todos`通知客户端关于待办事项状态更新`cursor/task`通知客户子代理任务完成`cursor/generate_image`通知客户端生成的图像输出
客户端可以实现这些方法，以匹配光标原生的交互行为。

## 最小 Node.js 客户端

此示例展示了自定义ACP客户端的最小控制流：

```
import { spawn } from "node:child_process";
import readline from "node:readline";

const agent = spawn("agent", ["acp"], { stdio: ["pipe", "pipe", "inherit"] });

let nextId = 1;
const pending = new Map();

function send(method, params) {
  const id = nextId++;
  agent.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function respond(id, result) {
  agent.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

const rl = readline.createInterface({ input: agent.stdout });
rl.on("line", line => {
  const msg = JSON.parse(line);

  if (msg.id && (msg.result || msg.error)) {
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    msg.error ? waiter.reject(msg.error) : waiter.resolve(msg.result);
    return;
  }

  if (msg.method === "session/update") {
    const update = msg.params?.update;
    if (update?.sessionUpdate === "agent_message_chunk" && update.content?.text) {
      process.stdout.write(update.content.text);
    }
    return;
  }

  if (msg.method === "session/request_permission") {
    respond(msg.id, { outcome: { outcome: "selected", optionId: "allow-once" } });
  }
});

const init = async () => {
  await send("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    clientInfo: { name: "acp-minimal-client", version: "0.1.0" }
  });

  await send("authenticate", { methodId: "cursor_login" });
  const { sessionId } = await send("session/new", { cwd: process.cwd(), mcpServers: [] });
  const result = await send("session/prompt", {
    sessionId,
    prompt: [{ type: "text", text: "Say hello in one sentence." }]
  });

  console.log(`\n\n[stopReason=${result.stopReason}]`);
};

init().finally(() => {
  agent.stdin.end();
  agent.kill();
});
```

## IDE 集成

ACP 使 Cursor 的 AI 代理能够与 Cursor 桌面应用之外的编辑协作。为你偏好的开发环境构建或使用第三方集成。

### 用例示例

- **JetBrains IDE** — 将 IntelliJ IDEA、WebStorm、PyCharm 或其他 JetBrains IDE 连接到 Cursor 的代理。请参阅 [JetBrains 集成指南](/docs/integrations/jetbrains)获取设置说明。
- **Neovim （avante.nvim）** — 使用 [avante.nvim](https://github.com/yetone/avante.nvim) 通过 ACP 将 Neovim 连接到光标的代理。请参见下方[的Neovim设置](#neovim-avantenvim)。
- **Zed** — 通过生成和通过 stdio 通信，集成 Zed 的现代编辑器。Zed 扩展可以实现 ACP 客户端协议，将 AI 请求路由到 Cursor。`agent acp`
- **自定义编辑器**——任何支持扩展的编辑器都可以实现 ACP 客户端。生成代理进程，通过 stdio 发送 JSON-RPC 消息，并在编辑器界面中处理响应。

### Neovim （avante.nvim）

[avante.nvim](https://github.com/yetone/avante.nvim) 是一个 Neovim 插件，提供一个由 AI 驱动的编码助手。它支持 ACP，所以你可以把它连接到 Cursor 的代理，在 Neovim 内部进行代理编码。

在你的lazy.nvim插件配置中添加以下内容（例如）：`~/.config/nvim/lua/plugins/avante.lua`

```
return {
  {
    "yetone/avante.nvim",
    event = "VeryLazy",
    version = false,
    build = "make",
    opts = {
      provider = "cursor",
      mode = "agentic",
      acp_providers = {
        cursor = {
          command = os.getenv("HOME") .. "/.local/bin/agent",
          args = { "acp" },
          auth_method = "cursor_login",
          env = {
            HOME = os.getenv("HOME"),
            PATH = os.getenv("PATH"),
          },
        },
      },
    },
    dependencies = {
      "nvim-lua/plenary.nvim",
      "MunifTanjim/nui.nvim",
      "nvim-tree/nvim-web-devicons",
      {
        "MeanderingProgrammer/render-markdown.nvim",
        opts = {
          file_types = { "markdown", "Avante" },
        },
        ft = { "markdown", "Avante" },
      },
    },
  },
}
```

主要设置：

- **`provider`**：设置为通过光标代理路由请求。`"cursor"`
- **`模式`**：设置为 以实现完整工具访问（文件编辑、终端命令）。仅使用聊天模式。`"agentic"``"normal"`
- **`命令`**：指向二进制。默认安装路径是 。如果你在别处安装了，请调整。`agent``~/.local/bin/agent`
- **`auth_method`**：用途。先在终端里运行认证。`"cursor_login"``agent login`

### 构建积分

1. 作为子生成的过程`agent acp`
2. 通过 JSON-RPC 通过 stdin/stdout 通信
3. 处理通知以显示流媒体回复`session/update`
4. 响应工具需要审批`session/request_permission`
5. 可选地实现光标扩展方法以实现更丰富的用户体验

请参阅上方[最小 Node.js 客户端](#minimal-nodejs-client)的工作参考实现。

## 相关

- [CLI中的MCP](/docs/cli/mcp): 通过光标CLI管理和使用MCP服务器
- [MCP概述](/docs/mcp): 学习MCP传输、配置和服务器设置
