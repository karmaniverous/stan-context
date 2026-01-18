/**
 * Requirements addressed:
 * - Compute SHA-256 content hashes (node:crypto) and sizes for source/external.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

export type FileHash = { size: number; hash: string };

export const hashFileSha256 = async (absPath: string): Promise<FileHash> => {
  const st = await stat(absPath);
  const h = createHash('sha256');

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(absPath);
    stream.on('data', (chunk) => h.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => {
      resolve();
    });
  });

  return { size: st.size, hash: h.digest('hex') };
};
