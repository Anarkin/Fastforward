import { findGit } from '../tools/git/main/locate';
import { GitLocator } from '../tools/git/main/gitLocator';
import { withLoginShellEnv } from './shellPath';

export async function gitLocator(): Promise<GitLocator> {
  await withLoginShellEnv(process.platform, process.env);
  return new GitLocator(await findGit(), () => findGit());
}
