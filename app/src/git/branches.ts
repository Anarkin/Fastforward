import { runGit } from './run';

export async function aheadBehind(
  gitPath: string,
  cwd: string,
  ref: string,
  upstream: string,
): Promise<{ ahead: number; behind: number }> {
  try {
    const output = await runGit(gitPath, cwd, [
      'rev-list',
      '--left-right',
      '--count',
      `${ref}...${upstream}`,
      '--',
    ]);
    const [ahead, behind] = output.trim().split(/\s+/).map(Number);
    return { ahead: ahead || 0, behind: behind || 0 };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

export async function fastForward(
  gitPath: string,
  cwd: string,
  ref: string,
): Promise<void> {
  await runGit(gitPath, cwd, ['merge', '--ff-only', ref]);
}

export async function remoteDefaultBranches(
  gitPath: string,
  cwd: string,
): Promise<string[]> {
  const output = await runGit(gitPath, cwd, [
    'for-each-ref',
    '--format=%(symref)',
    'refs/remotes/*/HEAD',
  ]);
  return output
    .split('\n')
    .filter((line) => line.startsWith('refs/remotes/'))
    .map((line) => line.slice('refs/remotes/'.length));
}

export async function onNoRef(
  gitPath: string,
  cwd: string,
  commit: string,
): Promise<string[]> {
  const output = await runGit(gitPath, cwd, [
    'rev-list',
    commit,
    '--not',
    '--branches',
    '--remotes',
    '--tags',
    'HEAD',
    '--',
  ]);
  return output.split('\n').filter(Boolean);
}
