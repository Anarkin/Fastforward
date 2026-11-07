import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

export async function gitDirOf(cwd: string): Promise<string | undefined> {
  const dotGit = join(cwd, '.git');
  const stats = await lstat(dotGit).catch(() => undefined);
  if (!stats?.isFile()) {
    return dotGit;
  }
  const named = /^gitdir: (.*)$/m
    .exec(await readFile(dotGit, 'utf8').catch(() => ''))?.[1]
    ?.trim();
  if (named === undefined) {
    return undefined;
  }
  return isAbsolute(named) ? named : join(cwd, named);
}
