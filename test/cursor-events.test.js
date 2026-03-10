import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildAskQuestionResponse,
  buildCreatePlanResponse,
  formatAskQuestionMessage,
  normalizeQuestions
} from '../src/cursor-events.js';

describe('Cursor ACP extension helpers', () => {
  it('normalizes ask_question payloads', () => {
    const questions = normalizeQuestions({
      questions: [
        {
          id: 'q1',
          prompt: '选择模式',
          options: [
            { id: 'agent', label: 'Agent' },
            { id: 'plan', label: 'Plan' }
          ]
        }
      ]
    });

    assert.strictEqual(questions.length, 1);
    assert.strictEqual(questions[0].options[0].id, 'agent');
  });

  it('builds ask_question responses from numeric selection', () => {
    const response = buildAskQuestionResponse({
      questions: [
        {
          id: 'q1',
          prompt: '选择模式',
          options: [
            { id: 'agent', label: 'Agent' },
            { id: 'plan', label: 'Plan' }
          ]
        }
      ]
    }, '2');

    assert.deepStrictEqual(response.result.answers[0].selectedOptionIds, ['plan']);
  });

  it('formats ask_question messages for Feishu', () => {
    const message = formatAskQuestionMessage({
      title: '需要选择模式',
      questions: [
        {
          id: 'q1',
          prompt: '选择模式',
          options: [
            { id: 'agent', label: 'Agent' },
            { id: 'plan', label: 'Plan' }
          ]
        }
      ]
    });

    assert.ok(message.includes('需要选择模式'));
    assert.ok(message.includes('1: Agent'));
  });

  it('accepts plan approval in Chinese', () => {
    const response = buildCreatePlanResponse('批准');
    assert.strictEqual(response.result.approved, true);
  });

  it('rejects invalid plan approval text', () => {
    assert.throws(() => buildCreatePlanResponse('稍后再说'));
  });
});
