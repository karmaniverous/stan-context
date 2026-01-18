import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const withTempDir = async <T>(
  fn: (dir: string) => Promise<T>,
): Promise<T> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stan-context-'));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

export const writeFile = async (
  root: string,
  rel: string,
  body: string,
): Promise<void> => {
  const abs = path.join(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body, 'utf8');
};
