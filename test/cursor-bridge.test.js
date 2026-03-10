import assert from 'node:assert';
import { describe, it } from 'node:test';
import { CursorBridge } from '../src/cursor-bridge.js';

describe('CursorBridge session params', () => {
  it('defaults mcpServers to an empty array', () => {
    const bridge = new CursorBridge({ cwd: '/tmp/example' });
    const params = bridge.buildSessionParams();

    assert.deepStrictEqual(params, {
      cwd: '/tmp/example',
      mcpServers: []
    });
  });

  it('includes mcpServers when provided explicitly', () => {
    const bridge = new CursorBridge({
      cwd: '/tmp/example',
      mcpServers: [{ name: 'filesystem' }]
    });
    const params = bridge.buildSessionParams();

    assert.deepStrictEqual(params, {
      cwd: '/tmp/example',
      mcpServers: [{ name: 'filesystem' }]
    });
  });
});
