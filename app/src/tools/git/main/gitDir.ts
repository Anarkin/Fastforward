import { isAbsolute, join, resolve } from 'node:path';
import { fsPromises } from '../../../lib/main/files';

export async function gitDirOf(cwd: string): Promise<string | undefined> {
  const dotGit = join(cwd, '.git');
  const stats = await fsPromises.lstat(dotGit).catch(() => undefined);
  if (!stats?.isFile()) {
    return dotGit;
  }
  const named = /^gitdir: (.*)$/m
    .exec(await fsPromises.readFile(dotGit, 'utf8').catch(() => ''))?.[1]
    ?.trim();
  if (named === undefined) {
    return undefined;
  }
  return isAbsolute(named) ? named : join(cwd, named);
}

export async function commonDirOf(gitDir: string): Promise<string> {
  const named = (
    await fsPromises.readFile(join(gitDir, 'commondir'), 'utf8').catch(() => '')
  ).trim();
  return named === '' ? gitDir : resolve(gitDir, named);
}
