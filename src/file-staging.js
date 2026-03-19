import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

function sanitizeFileName(fileName) {
  const cleaned = (fileName || 'attachment.bin')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return cleaned || 'attachment.bin';
}

export async function stageInboundFile({
  workspaceDir,
  channel,
  scopeKey,
  originalFileName,
  content
}) {
  const safeChannel = sanitizeFileName(channel);
  const safeScope = sanitizeFileName(scopeKey);
  const safeFileName = sanitizeFileName(originalFileName);
  const targetDir = path.join(workspaceDir, '.cursorclaw_uploads', safeChannel, safeScope);

  await mkdir(targetDir, { recursive: true });

  const stampedFileName = `${Date.now()}-${safeFileName}`;
  const absolutePath = path.join(targetDir, stampedFileName);
  await writeFile(absolutePath, content);

  return {
    absolutePath,
    relativePath: path.relative(workspaceDir, absolutePath) || stampedFileName,
    fileName: safeFileName
  };
}

export function buildFilePromptSection(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return '';
  }

  const lines = ['用户附带了以下本地文件，请直接读取并结合内容回答：'];
  for (const file of files) {
    lines.push(`- ${file.relativePath}`);
  }
  return lines.join('\n');
}
