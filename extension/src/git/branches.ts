import { runGit } from './run';

// Commits the checked-out branch has that its upstream doesn't, and the other
// way round, or of any two refs; asked from git, as the Git extension's counts
// can lag behind a change; nothing without an upstream or a branch
export async function aheadBehind(
  gitPath: string,
  cwd: string,
  ref = 'HEAD',
  upstream = '@{upstream}',
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

// Moves the checked-out branch up to a ref it is behind, and refuses when the
// branch has commits of its own
export async function fastForward(
  gitPath: string,
  cwd: string,
  ref: string,
): Promise<void> {
  await runGit(gitPath, cwd, ['merge', '--ff-only', ref]);
}

// The branch each remote considers its main one, like origin/main, which git
// records as refs/remotes/<remote>/HEAD when cloning
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
