import fs from 'node:fs';
import path from 'node:path';

const cache = new Map<string, string | null>();

export const findNearestPackageRoot = (absFile: string): string | null => {
  const start = path.dirname(absFile);
  const cached = cache.get(start);
  if (cached !== undefined) return cached;

  let cur = start;
  while (true) {
    const candidate = path.join(cur, 'package.json');
    if (fs.existsSync(candidate)) {
      cache.set(start, cur);
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }

  cache.set(start, null);
  return null;
};
