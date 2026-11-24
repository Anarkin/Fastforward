import { fsPromises as fs } from '../../../lib/main/files';
import * as path from 'node:path';

export function isFolder(folder: string): Promise<boolean> {
  return fs.stat(folder).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
}

export async function sameFolder(a: string, b: string): Promise<boolean> {
  try {
    const [realA, realB] = await Promise.all([fs.realpath(a), fs.realpath(b)]);
    return realA === realB;
  } catch {
    return false;
  }
}

export async function spellingOf(
  folder: string,
  known: readonly string[],
): Promise<string> {
  const same = known.find((spelling) => path.relative(spelling, folder) === '');
  if (same !== undefined) {
    return same;
  }
  const real = await Promise.all(
    known.map((spelling) => sameFolder(spelling, folder)),
  );
  return known[real.indexOf(true)] ?? folder;
}

export async function spelledFrom(
  spelling: string,
  folder: string,
): Promise<string> {
  const reached = path.resolve(
    spelling,
    path.relative(await fs.realpath(spelling), folder),
  );
  return (await sameFolder(reached, folder)) ? reached : folder;
}
