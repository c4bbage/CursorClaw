const COMMAND_BLOCK_PATTERN = /```app-commands\s*([\s\S]*?)```/g;
const COMMAND_BLOCK_OPEN = '```app-commands';
const STREAM_HOLDBACK_CHARS = COMMAND_BLOCK_OPEN.length;

export const APP_COMMANDS_INSTRUCTIONS = `当你需要宿主应用执行操作时，只能在回答末尾追加一个 \`\`\`app-commands\`\`\` 代码块。

格式要求：
\`\`\`app-commands
{"commands":[{"type":"schedule_task","taskId":"daily-news","cron":"0 9 * * *","prompt":"总结今天的新闻"}]}
\`\`\`

可用命令：
- schedule_task: {"type":"schedule_task","taskId":"...","cron":"...","prompt":"..."}
- list_tasks: {"type":"list_tasks"}
- cancel_task: {"type":"cancel_task","taskId":"..."}
- send_file: {"type":"send_file","filePath":"...","fileName":"..."}

规则：
- 代码块中只能放合法 JSON，不能有注释。
- 最多只能输出一个 app-commands 代码块。
- 如果不需要宿主应用执行操作，就不要输出这个代码块。
- 不要伪造命令执行结果，宿主应用会在执行后补充状态。`;

function stripCommandBlocks(text) {
  return text.replace(COMMAND_BLOCK_PATTERN, '').trim();
}

function normalizeCommands(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('app-commands block must contain a JSON object');
  }

  const { commands } = parsed;
  if (!Array.isArray(commands)) {
    throw new Error('app-commands JSON must include a commands array');
  }

  return commands.map((command, index) => validateCommand(command, index));
}

function validateCommand(command, index) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    throw new Error(`command #${index + 1} must be an object`);
  }

  switch (command.type) {
    case 'schedule_task':
      requireString(command, 'taskId', index);
      requireString(command, 'cron', index);
      requireString(command, 'prompt', index);
      return {
        type: 'schedule_task',
        taskId: command.taskId,
        cron: command.cron,
        prompt: command.prompt
      };
    case 'list_tasks':
      return { type: 'list_tasks' };
    case 'cancel_task':
      requireString(command, 'taskId', index);
      return {
        type: 'cancel_task',
        taskId: command.taskId
      };
    case 'send_file':
      requireString(command, 'filePath', index);
      return {
        type: 'send_file',
        filePath: command.filePath,
        fileName: typeof command.fileName === 'string' ? command.fileName : null
      };
    default:
      throw new Error(`command #${index + 1} has unsupported type: ${command.type}`);
  }
}

function requireString(command, fieldName, index) {
  if (typeof command[fieldName] !== 'string' || command[fieldName].trim() === '') {
    throw new Error(`command #${index + 1} is missing required field: ${fieldName}`);
  }
}

export function parseAppResponse(text) {
  const matches = [...text.matchAll(COMMAND_BLOCK_PATTERN)];
  if (matches.length === 0) {
    return {
      visibleText: text.trim(),
      commands: [],
      hasCommandBlock: false,
      parseError: null
    };
  }

  if (matches.length > 1) {
    return {
      visibleText: stripCommandBlocks(text),
      commands: [],
      hasCommandBlock: true,
      parseError: 'Only one app-commands block is allowed'
    };
  }

  const commandBlock = matches[0][1].trim();
  try {
    const parsed = JSON.parse(commandBlock);
    return {
      visibleText: stripCommandBlocks(text),
      commands: normalizeCommands(parsed),
      hasCommandBlock: true,
      parseError: null
    };
  } catch (error) {
    return {
      visibleText: stripCommandBlocks(text),
      commands: [],
      hasCommandBlock: true,
      parseError: error.message
    };
  }
}

export class AppResponseAccumulator {
  constructor() {
    this.rawText = '';
  }

  append(chunk) {
    this.rawText += chunk;
  }

  getStreamingText() {
    const blockStart = this.rawText.indexOf(COMMAND_BLOCK_OPEN);
    if (blockStart !== -1) {
      return this.rawText.slice(0, blockStart).trimEnd();
    }

    if (this.rawText.length <= STREAM_HOLDBACK_CHARS) {
      return '';
    }

    return this.rawText.slice(0, this.rawText.length - STREAM_HOLDBACK_CHARS);
  }

  finalize() {
    return parseAppResponse(this.rawText);
  }
}
