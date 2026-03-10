import assert from 'node:assert';
import { describe, it } from 'node:test';
import { AppResponseAccumulator, parseAppResponse } from '../src/app-commands.js';

describe('Application command parsing', () => {
  it('parses a single app-commands block', () => {
    const result = parseAppResponse(`你好

\`\`\`app-commands
{"commands":[{"type":"list_tasks"}]}
\`\`\``);

    assert.strictEqual(result.visibleText, '你好');
    assert.deepStrictEqual(result.commands, [{ type: 'list_tasks' }]);
    assert.strictEqual(result.parseError, null);
  });

  it('drops invalid command blocks from visible text', () => {
    const result = parseAppResponse(`测试

\`\`\`app-commands
{"commands":[{"type":"unknown"}]}
\`\`\``);

    assert.strictEqual(result.visibleText, '测试');
    assert.deepStrictEqual(result.commands, []);
    assert.ok(result.parseError);
  });

  it('hides the trailing command block during streaming', () => {
    const accumulator = new AppResponseAccumulator();

    accumulator.append('短回复');
    assert.strictEqual(accumulator.getStreamingText(), '');

    accumulator.append('，这里继续补充更多正文，让流式显示可以安全输出。');
    assert.ok(accumulator.getStreamingText().includes('短回复'));

    accumulator.append('\n```app-commands\n{"commands":[{"type":"list_tasks"}]}\n```');
    assert.strictEqual(accumulator.getStreamingText().includes('app-commands'), false);
  });
});
