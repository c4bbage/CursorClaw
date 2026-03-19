function normalizeOption(option, index) {
  if (typeof option === 'string') {
    return {
      id: option,
      label: option,
      index
    };
  }

  return {
    id: option?.id || option?.optionId || `option_${index + 1}`,
    label: option?.label || option?.title || option?.text || option?.id || `选项 ${index + 1}`,
    index
  };
}

export function normalizeQuestions(params) {
  const sourceQuestions = Array.isArray(params?.questions)
    ? params.questions
    : params?.question
      ? [params.question]
      : [];

  return sourceQuestions.map((question, index) => ({
    id: question?.id || `question_${index + 1}`,
    prompt: question?.prompt || question?.title || question?.text || question?.question || `问题 ${index + 1}`,
    allowMultiple: Boolean(question?.allow_multiple || question?.allowMultiple),
    options: Array.isArray(question?.options) ? question.options.map(normalizeOption) : []
  }));
}

export function formatAskQuestionMessage(params) {
  const title = params?.title || 'Cursor 需要你做一个选择';
  const description = [];
  const questions = normalizeQuestions(params);

  description.push(title);

  for (const [questionIndex, question] of questions.entries()) {
    description.push('');
    description.push(`${questionIndex + 1}. ${question.prompt}`);

    for (const option of question.options) {
      description.push(`- ${option.index + 1}: ${option.label} (${option.id})`);
    }

    description.push(question.allowMultiple ? '回复方式：可回复多个编号，使用逗号分隔。' : '回复方式：回复一个编号或 option id。');
  }

  return description.join('\n').trim();
}

function matchOption(token, options) {
  const normalizedToken = token.trim().toLowerCase();
  const byIndex = Number.parseInt(normalizedToken, 10);

  if (!Number.isNaN(byIndex)) {
    const option = options.find((item) => item.index === byIndex - 1);
    if (option) {
      return option;
    }
  }

  return options.find((item) =>
    item.id.toLowerCase() === normalizedToken || item.label.toLowerCase() === normalizedToken
  );
}

export function buildAskQuestionResponse(params, text) {
  const questions = normalizeQuestions(params);
  if (questions.length === 0) {
    return {
      result: { text },
      summary: text.trim() || '(empty)'
    };
  }

  const answers = [];
  for (const question of questions) {
    const tokens = text
      .split(/[\n,，]/)
      .map((item) => item.trim())
      .filter(Boolean);

    const matched = [];
    for (const token of tokens) {
      const option = matchOption(token, question.options);
      if (option && !matched.some((item) => item.id === option.id)) {
        matched.push(option);
      }
    }

    if (matched.length === 0) {
      throw new Error(`无法识别问题 "${question.prompt}" 的回答，请回复编号或 option id。`);
    }

    if (!question.allowMultiple && matched.length > 1) {
      throw new Error(`问题 "${question.prompt}" 只允许选择一个选项。`);
    }

    answers.push({
      questionId: question.id,
      selectedOptionIds: matched.map((option) => option.id),
      selectedOptions: matched.map((option) => ({ id: option.id, label: option.label }))
    });
  }

  return {
    result: {
      answers,
      text
    },
    summary: answers
      .map((answer) => `${answer.questionId}: ${answer.selectedOptions.map((option) => option.label).join(', ')}`)
      .join(' | ')
  };
}

export function formatCreatePlanMessage(params) {
  const title = params?.title || 'Cursor 请求你批准一个计划';
  const lines = [title];
  const planEntries = Array.isArray(params?.plan?.entries)
    ? params.plan.entries
    : Array.isArray(params?.entries)
      ? params.entries
      : [];

  if (planEntries.length > 0) {
    lines.push('');
    for (const [index, entry] of planEntries.entries()) {
      const content = entry?.content || entry?.description || entry?.title || `计划项 ${index + 1}`;
      const status = entry?.status ? ` [${entry.status}]` : '';
      lines.push(`${index + 1}. ${content}${status}`);
    }
  } else if (typeof params?.text === 'string' && params.text.trim()) {
    lines.push('');
    lines.push(params.text.trim());
  }

  lines.push('');
  lines.push('回复“批准 / yes / y”继续，回复“拒绝 / no / n”取消。');
  return lines.join('\n').trim();
}

export function buildCreatePlanResponse(text) {
  const normalized = text.trim().toLowerCase();
  const approveWords = ['y', 'yes', 'ok', 'approve', 'approved', 'go', 'run', '同意', '批准', '通过', '继续', '执行', '开始'];
  const rejectWords = ['n', 'no', 'reject', 'rejected', 'cancel', 'stop', '拒绝', '取消', '停止', '不要'];

  if (approveWords.includes(normalized)) {
    return {
      result: {
        approved: true,
        decision: 'approved',
        text
      },
      summary: '已批准计划'
    };
  }

  if (rejectWords.includes(normalized)) {
    return {
      result: {
        approved: false,
        decision: 'rejected',
        text
      },
      summary: '已拒绝计划'
    };
  }

  throw new Error('无法识别计划审批结果，请回复“批准”或“拒绝”。');
}

function extractTodos(params) {
  const candidates = [
    params?.todos,
    params?.items,
    params?.entries,
    params?.todo_list,
    params?.value?.todos,
    params?.update?.todos,
    params?.args?.todos
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

export function formatTodosMessage(params) {
  const todos = extractTodos(params);
  if (todos.length === 0) {
    return 'Cursor 更新了待办事项。';
  }

  const lines = ['Cursor 待办事项更新：'];
  for (const todo of todos) {
    lines.push(`- [${todo.status || 'unknown'}] ${todo.content || todo.id || 'unnamed task'}`);
  }
  return lines.join('\n');
}

export function formatTaskMessage(params) {
  const title = params?.description || params?.title || params?.task?.description || '子任务已完成';
  const status = params?.status || params?.task?.status;
  const resultText = typeof params?.result === 'string' ? params.result : params?.task?.result;
  const lines = [`Cursor 子任务更新：${title}`];

  if (status) {
    lines.push(`状态：${status}`);
  }

  if (typeof resultText === 'string' && resultText.trim()) {
    lines.push(`结果：${resultText.trim()}`);
  }

  return lines.join('\n');
}

export function extractGeneratedImagePaths(params) {
  const candidates = [
    params?.filePath,
    params?.path,
    params?.imagePath,
    params?.outputPath,
    params?.image?.path
  ];

  return candidates.filter((value) => typeof value === 'string' && value.trim());
}

export function formatGenerateImageMessage(params) {
  const description = params?.description || params?.prompt || 'Cursor 已生成图片。';
  return `Cursor 图片输出：${description}`;
}
