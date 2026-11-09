import * as fs from 'node:fs';
import { codeOf } from './reasons';

async function statOf(file: string): Promise<fs.BigIntStats | undefined> {
  try {
    return await fs.promises.lstat(file, { bigint: true });
  } catch (error) {
    if (codeOf(error) === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function renameUnlessTaken(
  from: string,
  to: string,
): Promise<void> {
  const there = await statOf(to);
  if (there !== undefined) {
    const source = await fs.promises.lstat(from, { bigint: true });
    if (source.ino !== there.ino || source.dev !== there.dev) {
      throw Object.assign(new Error(`EEXIST: file already exists, ${to}`), {
        code: 'EEXIST',
      });
    }
  }
  await fs.promises.rename(from, to);
}
