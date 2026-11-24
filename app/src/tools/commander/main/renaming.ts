import { fs } from '../../../lib/main/files';
import type { BigIntStats } from '../../../lib/main/files';
import { fileIdOf } from './fileIds';
import { codeOf } from '../../../lib/main/reasons';

async function statOf(file: string): Promise<BigIntStats | undefined> {
  try {
    return await fs.promises.lstat(file, { bigint: true });
  } catch (error) {
    if (codeOf(error) === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function sameItem(
  from: string,
  to: string,
  source: BigIntStats,
  there: BigIntStats,
): boolean {
  const id = fileIdOf(source);
  return id === undefined
    ? from.toLowerCase() === to.toLowerCase()
    : id === fileIdOf(there);
}

export async function renameUnlessTaken(
  from: string,
  to: string,
): Promise<void> {
  const there = await statOf(to);
  if (there !== undefined) {
    const source = await fs.promises.lstat(from, { bigint: true });
    if (!sameItem(from, to, source, there)) {
      throw Object.assign(new Error(`EEXIST: file already exists, ${to}`), {
        code: 'EEXIST',
      });
    }
  }
  await fs.promises.rename(from, to);
}
