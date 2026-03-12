# Hooks

Hooks let you observe, control, and extend the agent loop using custom scripts. Hooks are spawned processes that communicate over stdio using JSON in both directions. They run before or after defined stages of the agent loop and can observe, block, or modify behavior.

With hooks, you can:

- Run formatters after edits
- Add analytics for events
- Scan for PII or secrets
- Gate risky operations (e.g., SQL writes)
- Control subagent (Task tool) execution
- Inject context at session start

Looking for ready-to-use integrations? See [Partner Integrations](#partner-integrations) for security, governance, and secrets management solutions from our ecosystem partners.

Cursor supports loading hooks from third-party tools like Claude Code. See [Third Party Hooks](#third-party-hooks) for details on compatibility and configuration.

## Agent and Tab Support

Hooks work with both **Cursor Agent** (Cmd+K/Agent Chat) and **Cursor Tab** (inline completions), but they use different hook events:

**Agent (Cmd+K/Agent Chat)** uses the standard hooks:

- `sessionStart` / `sessionEnd` - Session lifecycle management
- `preToolUse` / `postToolUse` / `postToolUseFailure` - Generic tool use hooks (fires for all tools)
- `subagentStart` / `subagentStop` - Subagent (Task tool) lifecycle
- `beforeShellExecution` / `afterShellExecution` - Control shell commands
- `beforeMCPExecution` / `afterMCPExecution` - Control MCP tool usage
- `beforeReadFile` / `afterFileEdit` - Control file access and edits
- `beforeSubmitPrompt` - Validate prompts before submission
- `preCompact` - Observe context window compaction
- `stop` - Handle agent completion
- `afterAgentResponse` / `afterAgentThought` - Track agent responses

**Tab (inline completions)** uses specialized hooks:

- `beforeTabFileRead` - Control file access for Tab completions
- `afterTabFileEdit` - Post-process Tab edits

These separate hooks allow different policies for autonomous Tab operations versus user-directed Agent operations.

## Quickstart

Create a  file. You can create it at the project level () or in your home directory (). Project-level hooks apply only to that specific project, while home directory hooks apply globally.`hooks.json``<project>/.cursor/hooks.json``~/.cursor/hooks.json`

User hooks (~/.cursor/)Project hooks (.cursor/)For project-level hooks that apply to a specific repository, create :`<project>/.cursor/hooks.json`

```
{
  "version": 1,
  "hooks": {
    "afterFileEdit": [{ "command": ".cursor/hooks/format.sh" }]
  }
}
```

Note: Project hooks run from the **project root**, so use  (not ).`.cursor/hooks/format.sh``./hooks/format.sh`

Create your hook script at :`<project>/.cursor/hooks/format.sh`

```
#!/bin/bash
# Read input, do something, exit 0
cat > /dev/null
exit 0
```

Make it executable:

```
chmod +x .cursor/hooks/format.sh
```

Cursor watches hooks config files and reloads them automatically. Your hook runs after every file edit.

## Hook Types

Hooks support two execution types: command-based (default) and prompt-based (LLM-evaluated).

### Command-Based Hooks

Command hooks execute shell scripts that receive JSON input via stdin and return JSON output via stdout.

```
{
  "hooks": {
    "beforeShellExecution": [
      {
        "command": "./scripts/approve-network.sh",
        "timeout": 30,
        "matcher": "curl|wget|nc"
      }
    ]
  }
}
```

**Exit code behavior:**

- Exit code  - Hook succeeded, use the JSON output`0`
- Exit code  - Block the action (equivalent to returning `2``permission: "deny"`)
- Other exit codes - Hook failed, action proceeds (fail-open by default)

### Prompt-Based Hooks

Prompt hooks use an LLM to evaluate a natural language condition. They're useful for policy enforcement without writing custom scripts.

```
{
  "hooks": {
    "beforeShellExecution": [
      {
        "type": "prompt",
        "prompt": "Does this command look safe to execute? Only allow read-only operations.",
        "timeout": 10
      }
    ]
  }
}
```

**Features:**

- Returns structured  response`{ ok: boolean, reason?: string }`
- Uses a fast model for quick evaluation
- `$ARGUMENTS` placeholder is auto-replaced with hook input JSON
- If  is absent, hook input is auto-appended`$ARGUMENTS`
- Optional  field to override the default LLM model`model`

## Examples

The examples below use  paths, which work for **user hooks** () where scripts run from . For **project hooks** (), use  paths instead since scripts run from the project root.`./hooks/...``~/.cursor/hooks.json``~/.cursor/``<project>/.cursor/hooks.json``.cursor/hooks/...`

hooks.jsonaudit.shblock-git.sh```
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "command": "./hooks/session-init.sh"
      }
    ],
    "sessionEnd": [
      {
        "command": "./hooks/audit.sh"
      }
    ],
    "beforeShellExecution": [
      {
        "command": "./hooks/audit.sh"
      },
      {
        "command": "./hooks/block-git.sh"
      }
    ],
    "beforeMCPExecution": [
      {
        "command": "./hooks/audit.sh"
      }
    ],
    "afterShellExecution": [
      {
        "command": "./hooks/audit.sh"
      }
    ],
    "afterMCPExecution": [
      {
        "command": "./hooks/audit.sh"
      }
    ],
    "afterFileEdit": [
      {
        "command": "./hooks/audit.sh"
      }
    ],
    "beforeSubmitPrompt": [
      {
        "command": "./hooks/audit.sh"
      }
    ],
    "preCompact": [
      {
        "command": "./hooks/audit.sh"
      }
    ],
    "stop": [
      {
        "command": "./hooks/audit.sh"
      }
    ],
    "beforeTabFileRead": [
      {
        "command": "./hooks/redact-secrets-tab.sh"
      }
    ],
    "afterTabFileEdit": [
      {
        "command": "./hooks/format-tab.sh"
      }
    ]
  }
}
```

### TypeScript stop automation hook

Choose TypeScript when you need typed JSON, durable file I/O, and HTTP calls in the same hook. This Bun-powered  hook tracks per-conversation failure counts on disk, forwards structured telemetry to an internal API, and can automatically schedule a retry when the agent fails twice in a row.`stop`

hooks.json.cursor/hooks/track-stop.ts```
{
  "version": 1,
  "hooks": {
    "stop": [
      {
        "command": "bun run .cursor/hooks/track-stop.ts --stop"
      }
    ]
  }
}
```

Set  to the internal endpoint that should receive run summaries.`AGENT_TELEMETRY_URL`

### Python manifest guard hook

Python shines when you need rich parsing libraries. This hook uses  to inspect Kubernetes manifests before  runs; Bash would struggle to parse multi-document YAML safely.`pyyaml``kubectl apply`

hooks.json.cursor/hooks/kube_guard.py```
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [
      {
        "command": "python3 .cursor/hooks/kube_guard.py"
      }
    ]
  }
}
```

Install PyYAML (for example, ) wherever your hook scripts run so the parser import succeeds.`pip install pyyaml`

## Partner Integrations

We partner with ecosystem vendors who have built hooks support with Cursor. These integrations cover security scanning, governance, secrets management, and more.

### MCP governance and visibility

PartnerDescription[MintMCP](https://www.mintmcp.com/blog/mcp-governance-cursor-hooks)Build a complete inventory of MCP servers, monitor tool usage patterns, and scan responses for sensitive data before it reaches the AI model.[Oasis Security](https://www.oasis.security/blog/cursor-oasis-governing-agentic-access)Enforce least-privilege policies on AI agent actions and maintain full audit trails across enterprise systems.[Runlayer](https://www.runlayer.com/blog/cursor-hooks)Wrap MCP tools and integrate with their MCP broker for centralized control and visibility over agent-to-tool interactions.
### Code security and best practices

PartnerDescription[Corridor](https://corridor.dev/blog/corridor-cursor-hooks/)Get real-time feedback on code implementation and security design decisions as code is being written.[Semgrep](https://semgrep.dev/blog/2025/cursor-hooks-mcp-server)Automatically scan AI-generated code for vulnerabilities with real-time feedback to regenerate code until security issues are resolved.
### Dependency security

PartnerDescription[Endor Labs](https://www.endorlabs.com/learn/bringing-malware-detection-into-ai-coding-workflows-with-cursor-hooks)Intercept package installations and scan for malicious dependencies, preventing supply chain attacks before they enter your codebase.
### Agent security and safety

PartnerDescription[Snyk](https://snyk.io/blog/evo-agent-guard-cursor-integration/)Review agent actions in real-time with Evo Agent Guard, detecting and preventing issues like prompt injection and dangerous tool calls.
### Secrets management

PartnerDescription[1Password](https://marketplace.1password.com/integration/cursor-hooks)Validate that environment files from 1Password Environments are properly mounted before shell commands execute, enabling just-in-time secrets access without writing credentials to disk.
For more details about our hooks partners, see the [Hooks for security and platform teams](/blog/hooks-partners) blog post.

## Configuration

Define hooks in a  file. Configuration can exist at multiple levels. All matching hooks from every source run; when responses conflict, higher-priority sources take precedence during merge:`hooks.json`

```
~/.cursor/
├── hooks.json
└── hooks/
    ├── audit.sh
    └── block-git.sh
```

- **Enterprise** (MDM-managed, system-wide):
- macOS: `/Library/Application Support/Cursor/hooks.json`
- Linux/WSL: `/etc/cursor/hooks.json`
- Windows: `C:\\ProgramData\\Cursor\\hooks.json`
- **Team** (Cloud-distributed, enterprise only):
- Configured in the [web dashboard](https://cursor.com/dashboard?tab=team-content&section=hooks) and synced to all team members automatically
- **Project** (Project-specific):
- `<project-root>/.cursor/hooks.json`
- Project hooks run in any trusted workspace and are checked into version control with your project
- **User** (User-specific):
- `~/.cursor/hooks.json`

Priority order (highest to lowest): Enterprise → Team → Project → User

The  object maps hook names to arrays of hook definitions. Each definition currently supports a  property that can be a shell string, an absolute path, or a relative path. The working directory depends on the hook source:`hooks``command`

- **Project hooks** ( in a repository): Run from the **project root**`.cursor/hooks.json`
- **User hooks** (): Run from `~/.cursor/hooks.json``~/.cursor/`
- **Enterprise hooks** (system-wide config): Run from the enterprise config directory
- **Team hooks** (cloud-distributed): Run from the managed hooks directory

For project hooks, use paths like  (relative to project root), not  (which would look for ).`.cursor/hooks/script.sh``./hooks/script.sh``<project>/hooks/script.sh`

### Configuration file

This example shows a user-level hooks file (). For project-level hooks, change paths like  to :`~/.cursor/hooks.json``./hooks/script.sh``.cursor/hooks/script.sh`

```
{
  "version": 1,
  "hooks": {
    "sessionStart": [{ "command": "./session-init.sh" }],
    "sessionEnd": [{ "command": "./audit.sh" }],
    "preToolUse": [
      {
        "command": "./hooks/validate-tool.sh",
        "matcher": "Shell|Read|Write"
      }
    ],
    "postToolUse": [{ "command": "./hooks/audit-tool.sh" }],
    "subagentStart": [{ "command": "./hooks/validate-subagent.sh" }],
    "subagentStop": [{ "command": "./hooks/audit-subagent.sh" }],
    "beforeShellExecution": [{ "command": "./script.sh" }],
    "afterShellExecution": [{ "command": "./script.sh" }],
    "afterMCPExecution": [{ "command": "./script.sh" }],
    "afterFileEdit": [{ "command": "./format.sh" }],
    "preCompact": [{ "command": "./audit.sh" }],
    "stop": [{ "command": "./audit.sh", "loop_limit": 10 }],
    "beforeTabFileRead": [{ "command": "./redact-secrets-tab.sh" }],
    "afterTabFileEdit": [{ "command": "./format-tab.sh" }]
  }
}
```

The Agent hooks (, , , , , , , , , , , , , , , , , ) apply to Cmd+K and Agent Chat operations. The Tab hooks (, ) apply specifically to inline Tab completions.`sessionStart``sessionEnd``preToolUse``postToolUse``postToolUseFailure``subagentStart``subagentStop``beforeShellExecution``afterShellExecution``beforeMCPExecution``afterMCPExecution``beforeReadFile``afterFileEdit``beforeSubmitPrompt``preCompact``stop``afterAgentResponse``afterAgentThought``beforeTabFileRead``afterTabFileEdit`

### Global Configuration Options

OptionTypeDefaultDescription`version`number`1`Config schema version
### Per-Script Configuration Options

OptionTypeDefaultDescription`command`stringrequiredScript path or command`type``"command"` | `"prompt"``"command"`钩子执行类型`timeout`人数平台默认执行超时（秒数）`loop_limit`数字 |无效`5`每个脚本的 stop/subagentStop 钩子循环限制。 意味着没有限制。默认是光标钩子，Claude Code 钩子。`null``5``null``failClosed`布尔值`false`当 时，钩子失败（崩溃、超时、无效 JSON 会阻挡该动作，而不是允许它通过）。对安全关键的钩子非常有用。`true``matcher`对象-钩子运行时的过滤条件
### 匹配器配置

匹配器可以让你过滤钩子运行时的效果。匹配者应用的场域取决于钩子：

```
{
  "hooks": {
    "preToolUse": [
      {
        "command": "./validate-shell.sh",
        "matcher": "Shell"
      }
    ],
    "subagentStart": [
      {
        "command": "./validate-explore.sh",
        "matcher": "explore|shell"
      }
    ],
    "beforeShellExecution": [
      {
        "command": "./approve-network.sh",
        "matcher": "curl|wget|nc "
      }
    ]
  }
}
```

- **subagentStart**：匹配器针对**子代理类型**运行（例如 ， ， ）。只有在特定类型的子代理启动时才用它来运行钩子。上述示例仅适用于explore或shell子代理。`explore``shell``generalPurpose``validate-explore.sh`
- **beforeShellExecution**：匹配器对 **shell 命令**字符串运行。只有当命令匹配模式（例如网络调用、文件删除）时，才用它运行钩子。上述示例仅在命令包含 、 、 或 时运行。`approve-network.sh``curl``wget``nc `

**按钩子划分的匹配器：**

- **preToolUse / postToolUse / postToolUseFailure**：按工具类型筛选。数值包括 、 、 、 、 和 MCP 工具，使用格式。`Shell``Read``Write``Grep``Delete``Task``MCP:<tool_name>`
- **subagentStart / subagentStop**：按子代理类型（、、、等）进行筛选。`generalPurpose``explore``shell`
- **beforeShellExecution / afterShellExecution**：通过shell命令文本进行过滤;匹配器会与完整的命令字符串匹配。
- **beforeReadFile**：按工具类型筛选（、 等）。`TabRead``Read`
- **afterFileEdit**：按工具类型（、等）进行筛选。`TabWrite``Write`
- **beforeSubmitPrompt**：与值匹配。`UserPromptSubmit`
- **stop**：与值 匹配。`Stop`
- **afterAgentResponse**：与值 匹配。`AgentResponse`
- **afterAgentThought**：与值匹配。`AgentThought`

## 球队分布

钩子可以通过项目钩子（通过版本控制）、MDM工具或Cursor的云分发系统分发给团队成员。

### 项目钩子（版本控制）

项目钩子是与团队分享钩子的最简单方式。放置一个文件并提交到你的仓库。当团队成员在可信工作区打开项目时，Cursor 会自动加载并运行项目钩子。`hooks.json``<project-root>/.cursor/hooks.json`

项目钩子：

- 它们和你的代码一起存储在版本控制中
- 自动加载所有可信工作空间中的团队成员
- 可以是项目特定的（例如，强制执行特定代码库的格式标准）
- 要求工作区被信任运行（为了安全）

### MDM Distribution

Distribute hooks across your organization using Mobile Device Management (MDM) tools. Place the  file and hook scripts in the target directories on each machine.`hooks.json`

**User home directory** (per-user distribution):

- `~/.cursor/hooks.json`
- `~/.cursor/hooks/` (for hook scripts)

**Global directories** (system-wide distribution):

- macOS: `/Library/Application Support/Cursor/hooks.json`
- Linux/WSL: `/etc/cursor/hooks.json`
- Windows: `C:\\ProgramData\\Cursor\\hooks.json`

Note: MDM-based distribution is fully managed by your organization. Cursor does not deploy or manage files through your MDM solution. Ensure your internal IT or security team handles configuration, deployment, and updates in accordance with your organization's policies.

### Cloud Distribution (Enterprise Only)

Enterprise teams can use Cursor's native cloud distribution to automatically sync hooks to all team members. Configure hooks in the [web dashboard](https://cursor.com/dashboard?tab=team-content&section=hooks). Cursor automatically delivers configured hooks to all client machines when team members log in.

Cloud distribution provides:

- Automatic synchronization to all team members (every thirty minutes)
- Operating system targeting for platform-specific hooks
- Centralized management through the dashboard

Enterprise administrators can create, edit, and manage team hooks from the dashboard without requiring access to individual machines.

## Reference

### Common schema

#### Input (all hooks)

All hooks receive a base set of fields in addition to their hook-specific fields:

```
{
  "conversation_id": "string",
  "generation_id": "string",
  "model": "string",
  "hook_event_name": "string",
  "cursor_version": "string",
  "workspace_roots": ["<path>"],
  "user_email": "string | null",
  "transcript_path": "string | null"
}
```

FieldTypeDescription`conversation_id`stringStable ID of the conversation across many turns`generation_id`stringThe current generation that changes with every user message`model`stringThe model configured for the composer that triggered the hook`hook_event_name`stringWhich hook is being run`cursor_version`stringCursor application version (e.g. "1.7.2")`workspace_roots`string[]The list of root folders in the workspace (normally just one, but multiroot workspaces can have multiple)`user_email`string | nullEmail address of the authenticated user, if available`transcript_path`string | nullPath to the main conversation transcript file (null if transcripts disabled)
### Hook events

#### preToolUse

Called before any tool execution. This is a generic hook that fires for all tool types (Shell, Read, Write, MCP, Task, etc.). Use matchers to filter by specific tools.

```
// Input
{
  "tool_name": "Shell",
  "tool_input": { "command": "npm install", "working_directory": "/project" },
  "tool_use_id": "abc123",
  "cwd": "/project",
  "model": "claude-sonnet-4-20250514",
  "agent_message": "Installing dependencies..."
}

// Output
{
  "permission": "allow" | "deny",
  "user_message": "<message shown in client when denied>",
  "agent_message": "<message sent to agent when denied>",
  "updated_input": { "command": "npm ci" }
}
```

Output FieldTypeDescription`permission`string`"allow"` to proceed,  to block.  is accepted by the schema but not enforced for  today.`"deny"``"ask"``preToolUse``user_message`string (optional)Message shown to the user when the action is denied`agent_message`string (optional)Message fed back to the agent when the action is denied`updated_input`object (optional)Modified tool input to use instead
#### postToolUse

Called after successful tool execution. Useful for auditing, analytics, and injecting context.

```
// Input
{
  "tool_name": "Shell",
  "tool_input": { "command": "npm test" },
  "tool_output": "{\"exitCode\":0,\"stdout\":\"All tests passed\"}",
  "tool_use_id": "abc123",
  "cwd": "/project",
  "duration": 5432,
  "model": "claude-sonnet-4-20250514"
}

// Output
{
  "updated_mcp_tool_output": { "modified": "output" },
  "additional_context": "Test coverage report attached."
}
```

Input FieldTypeDescription`duration`numberExecution time in milliseconds`tool_output`stringJSON-stringified result payload from the tool (not raw terminal text)
Output FieldTypeDescription`updated_mcp_tool_output`object (optional)For MCP tools only: replaces the tool output seen by the model`additional_context`string (optional)Extra context injected into the conversation after the tool result
#### postToolUseFailure

Called when a tool fails, times out, or is denied. Useful for error tracking and recovery logic.

```
// Input
{
  "tool_name": "Shell",
  "tool_input": { "command": "npm test" },
  "tool_use_id": "abc123",
  "cwd": "/project",
  "error_message": "Command timed out after 30s",
  "failure_type": "timeout" | "error" | "permission_denied",
  "duration": 5000,
  "is_interrupt": false
}

// Output
{
  // No output fields currently supported
}
```

Input FieldTypeDescription`error_message`stringDescription of the failure`failure_type`stringType of failure: , , or `"error"``"timeout"``"permission_denied"``duration`numberTime in milliseconds until the failure occurred`is_interrupt`booleanWhether this failure was caused by a user interrupt/cancellation
#### subagentStart

Called before spawning a subagent (Task tool). Can allow or deny subagent creation.

```
// Input
{
  "subagent_id": "abc-123",
  "subagent_type": "generalPurpose",
  "task": "Explore the authentication flow",
  "parent_conversation_id": "conv-456",
  "tool_call_id": "tc-789",
  "subagent_model": "claude-sonnet-4-20250514",
  "is_parallel_worker": false,
  "git_branch": "feature/auth"
}

// Output
{
  "permission": "allow" | "deny",
  "user_message": "<message shown when denied>"
}
```

Input FieldTypeDescription`subagent_id`stringUnique identifier for this subagent instance`subagent_type`stringType of subagent: , , , etc.`generalPurpose``explore``shell``task`stringThe task description given to the subagent`parent_conversation_id`stringConversation ID of the parent agent session`tool_call_id`stringID of the tool call that triggered the subagent`subagent_model`stringModel the subagent will use`is_parallel_worker`booleanWhether this subagent is running as a parallel worker`git_branch`string (optional)Git branch the subagent will operate on, if applicable
Output FieldTypeDescription`permission`string`"allow"` to proceed,  to block.  is not supported for  and is treated as .`"deny"``"ask"``subagentStart``"deny"``user_message`string (optional)Message shown to the user when the subagent is denied
#### subagentStop

Called when a subagent completes, errors, or is aborted. Can trigger follow-up actions.

```
// Input
{
  "subagent_type": "generalPurpose",
  "status": "completed" | "error" | "aborted",
  "task": "Explore the authentication flow",
  "description": "Exploring auth flow",
  "summary": "<subagent output summary>",
  "duration_ms": 45000,
  "message_count": 12,
  "tool_call_count": 8,
  "loop_count": 0,
  "modified_files": ["src/auth.ts"],
  "agent_transcript_path": "/path/to/subagent/transcript.txt"
}

// Output
{
  "followup_message": "<auto-continue with this message>"
}
```

Input FieldTypeDescription`subagent_type`stringType of subagent: , , , etc.`generalPurpose``explore``shell``status`string`"completed"`, , or `"error"``"aborted"``task`stringThe task description given to the subagent`description`stringShort description of the subagent's purpose`summary`stringOutput summary from the subagent`duration_ms`numberExecution time in milliseconds`message_count`numberNumber of messages exchanged during the subagent session`tool_call_count`numberNumber of tool calls the subagent made`loop_count`numberNumber of times a  follow-up has already triggered for this subagent (starts at 0)`subagentStop``modified_files`string[]Files the subagent modified`agent_transcript_path`string | nullPath to the subagent's own transcript file (separate from the parent conversation)
Output FieldTypeDescription`followup_message`string (optional)Auto-continue with this message. Only consumed when  is .`status``"completed"`
The  field enables loop-style flows where subagent completion triggers the next iteration. Follow-ups are subject to the same configurable loop limit as the  hook (default 5, configurable via ).`followup_message``stop``loop_limit`

#### beforeShellExecution / beforeMCPExecution

Called before any shell command or MCP tool is executed. Return a permission decision.

By default, hook failures (crash, timeout, invalid JSON) allow the action through (fail-open). Set  on the hook definition to block the action on failure instead. This is recommended for security-critical  hooks.`failClosed: true``beforeMCPExecution`

```
// beforeShellExecution input
{
  "command": "<full terminal command>",
  "cwd": "<current working directory>",
  "sandbox": false
}

// beforeMCPExecution input
{
  "tool_name": "<tool name>",
  "tool_input": "<json params>"
}
// Plus either:
{ "url": "<server url>" }
// Or:
{ "command": "<command string>" }

// Output
{
  "permission": "allow" | "deny" | "ask",
  "user_message": "<message shown in client>",
  "agent_message": "<message sent to agent>"
}
```

#### afterShellExecution

Fires after a shell command executes; useful for auditing or collecting metrics from command output.

```
// Input
{
  "command": "<full terminal command>",
  "output": "<full terminal output>",
  "duration": 1234,
  "sandbox": false
}
```

FieldTypeDescription`command`stringThe full terminal command that was executed`output`stringFull output captured from the terminal`duration`numberDuration in milliseconds spent executing the shell command (excludes approval wait time)`sandbox`booleanWhether the command ran in a sandboxed environment
#### afterMCPExecution

Fires after an MCP tool executes; includes the tool's input parameters and full JSON result.

```
// Input
{
  "tool_name": "<tool name>",
  "tool_input": "<json params>",
  "result_json": "<tool result json>",
  "duration": 1234
}
```

FieldTypeDescription`tool_name`stringName of the MCP tool that was executed`tool_input`stringJSON params string passed to the tool`result_json`stringJSON string of the tool response`duration`numberDuration in milliseconds spent executing the MCP tool (excludes approval wait time)
#### afterFileEdit

Fires after the Agent edits a file; useful for formatters or accounting of agent-written code.

```
// Input
{
  "file_path": "<absolute path>",
  "edits": [{ "old_string": "<search>", "new_string": "<replace>" }]
}
```

#### beforeReadFile

Called before Agent reads a file. Use for access control to block sensitive files from being sent to the model.

By default,  hook failures (crash, timeout, invalid JSON) are logged and the read is allowed through. Set  on the hook definition to block the read on failure instead.`beforeReadFile``failClosed: true`

```
// Input
{
  "file_path": "<absolute path>",
  "content": "<file contents>",
  "attachments": [
    {
      "type": "file" | "rule",
      "file_path": "<absolute path>"
    }
  ]
}

// Output
{
  "permission": "allow" | "deny",
  "user_message": "<message shown when denied>"
}
```

Input FieldTypeDescription`file_path`stringAbsolute path to the file being read`content`stringFull contents of the file`attachments`arrayContext attachments associated with the prompt. Each entry has a  ( or ) and a .`type``"file"``"rule"``file_path`
Output FieldTypeDescription`permission`string`"allow"` to proceed,  to block`"deny"``user_message`string (optional)Message shown to user when denied
#### beforeTabFileRead

Called before Tab (inline completions) reads a file. Enable redaction or access control before Tab accesses file contents.

**Key differences from `beforeReadFile`:**

- Only triggered by Tab, not Agent
- Does not include  field (Tab doesn't use prompt attachments)`attachments`
- Useful for applying different policies to autonomous Tab operations

```
// Input
{
  "file_path": "<absolute path>",
  "content": "<file contents>"
}

// Output
{
  "permission": "allow" | "deny"
}
```

#### afterTabFileEdit

Called after Tab (inline completions) edits a file. Useful for formatters or auditing of Tab-written code.

**Key differences from `afterFileEdit`:**

- Only triggered by Tab, not Agent
- Includes detailed edit information: , , and  for precise edit tracking`range``old_line``new_line`
- Useful for fine-grained formatting or analysis of Tab edits

```
// Input
{
  "file_path": "<absolute path>",
  "edits": [
    {
      "old_string": "<search>",
      "new_string": "<replace>",
      "range": {
        "start_line_number": 10,
        "start_column": 5,
        "end_line_number": 10,
        "end_column": 20
      },
      "old_line": "<line before edit>",
      "new_line": "<line after edit>"
    }
  ]
}

// Output
{
  // No output fields currently supported
}
```

#### beforeSubmitPrompt

Called right after user hits send but before backend request. Can prevent submission.

```
// Input
{
  "prompt": "<user prompt text>",
  "attachments": [
    {
      "type": "file" | "rule",
      "file_path": "<absolute path>"
    }
  ]
}

// Output
{
  "continue": true | false,
  "user_message": "<message shown to user when blocked>"
}
```

输出场类型描述`continue`布尔值是否允许迅速提交继续`user_message`字符串（可选）提示被阻塞时向用户显示的消息
#### 之后AgentResponse（特工响应）

客服完成助理留言后才打电话。

```
// Input
{
  "text": "<assistant final text>"
}
```

#### 之后AgentThought

在客服完成思考障碍后被打电话。有助于观察代理人的推理过程。

```
// Input
{
  "text": "<fully aggregated thinking text>",
  "duration_ms": 5000
}

// Output
{
  // No output fields currently supported
}
```

场地类型描述`text`弦完成区块的完整聚合思考文本`duration_ms`数量（可选）思考块的持续时间（毫秒）
#### 停下

代理循环结束时调用。可选地自动提交后续用户消息以持续迭代。

```
// Input
{
  "status": "completed" | "aborted" | "error",
  "loop_count": 0
}
```

```
// Output
{
  "followup_message": "<message text>"
}
```

- 可选的是字符串。当提供且非空时，光标会自动作为下一个用户消息提交。这使得循环式流程成为可能（例如，迭代直到目标达成）。`followup_message`
- 该字段表示停止挂钩已触发该对话自动后续的次数（从0开始）。默认限制是每个脚本自动跟进5次，可以通过选项配置。设置为取下盖子。后续的限制也是一样的。`loop_count``loop_limit``loop_limit``null``subagentStop`

#### sessionStart

当新作曲家对话创建时会被调用。这个钩子就像是“放火后忘却”;代理循环不等待或强制执行阻塞响应。用它来设置会话特定的环境变量或注入额外的上下文。

```
// Input
{
  "session_id": "<unique session identifier>",
  "is_background_agent": true | false,
  "composer_mode": "agent" | "ask" | "edit"
}
```

```
// Output
{
  "env": { "<key>": "<value>" },
  "additional_context": "<context to add to conversation>"
}
```

输入场类型描述`session_id`弦该会话的唯一标识符（同为`conversation_id`)`is_background_agent`布尔值无论是后台代理会话还是交互会话`composer_mode`字符串（可选）作曲家开始的模式（例如，“代理人”、“询问”、“编辑”）
输出场类型描述`env`对象（可选）为本次会话设置环境变量。所有后续的钩子执行均可调用`additional_context`string (optional)Additional context to add to the conversation's initial system context
The schema also accepts  and  fields, but current callers do not enforce them. Session creation is not blocked even when  is .`continue``user_message``continue``false`

#### sessionEnd

Called when a composer conversation ends. This is a fire-and-forget hook useful for logging, analytics, or cleanup tasks. The response is logged but not used.

```
// Input
{
  "session_id": "<unique session identifier>",
  "reason": "completed" | "aborted" | "error" | "window_close" | "user_close",
  "duration_ms": 45000,
  "is_background_agent": true | false,
  "final_status": "<status string>",
  "error_message": "<error details if reason is 'error'>"
}
```

```
// Output
{
  // No output fields - fire and forget
}
```

Input FieldTypeDescription`session_id`stringUnique identifier for the session that is ending`reason`stringHow the session ended: "completed", "aborted", "error", "window_close", or "user_close"`duration_ms`numberTotal duration of the session in milliseconds`is_background_agent`booleanWhether this was a background agent session`final_status`stringFinal status of the session`error_message`string (optional)Error message if reason is "error"
#### preCompact

Called before context window compaction/summarization occurs. This is an observational hook that cannot block or modify the compaction behavior. Useful for logging when compaction happens or notifying users.

```
// Input
{
  "trigger": "auto" | "manual",
  "context_usage_percent": 85,
  "context_tokens": 120000,
  "context_window_size": 128000,
  "message_count": 45,
  "messages_to_compact": 30,
  "is_first_compaction": true | false
}
```

```
// Output
{
  "user_message": "<message to show when compaction occurs>"
}
```

Input FieldTypeDescription`trigger`stringWhat triggered the compaction: "auto" or "manual"`context_usage_percent`numberCurrent context window usage as a percentage (0-100)`context_tokens`numberCurrent context window token count`context_window_size`numberMaximum context window size in tokens`message_count`numberNumber of messages in the conversation`messages_to_compact`numberNumber of messages that will be summarized`is_first_compaction`booleanWhether this is the first compaction for this conversation
Output FieldTypeDescription`user_message`string (optional)Message to show to the user when compaction occurs
## Environment Variables

Hook scripts receive environment variables when executed:

VariableDescriptionAlways Present`CURSOR_PROJECT_DIR`Workspace root directoryYes`CURSOR_VERSION`Cursor version stringYes`CURSOR_USER_EMAIL`Authenticated user emailIf logged in`CURSOR_TRANSCRIPT_PATH`Path to the conversation transcript fileIf transcripts enabled`CURSOR_CODE_REMOTE`Set to the string  when running in a remote workspace`"true"`For remote workspaces`CLAUDE_PROJECT_DIR`Alias for project dir (Claude compatibility)Yes
Session-scoped environment variables from  hooks are passed to all subsequent hook executions within that session.`sessionStart`

## Troubleshooting

**How to confirm hooks are active**

There is a Hooks tab in Cursor Settings to debug configured and executed hooks, as well as a Hooks output channel to see errors.

**If hooks are not working**

- Cursor watches  files and reloads them on save. If hooks still do not load, restart Cursor.`hooks.json`
- Check that relative paths are correct for your hook source:
- For **project hooks**, paths are relative to the **project root** (e.g., `.cursor/hooks/script.sh`)
- For **user hooks**, paths are relative to  (e.g.,  or `~/.cursor/``./hooks/script.sh``hooks/script.sh`)

**Exit code blocking**

Exit code  from command hooks blocks the action (equivalent to returning ). This matches Claude Code behavior for compatibility.`2``permission: "deny"`