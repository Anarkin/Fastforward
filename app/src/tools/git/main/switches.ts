import { runGit } from './run';

export async function switchToBranch(
  gitPath: string,
  root: string,
  branch: string,
): Promise<void> {
  await runGit(
    gitPath,
    root,
    [
      'switch',
      '-q',
      '--no-guess',
      '--no-overwrite-ignore',
      '--end-of-options',
      branch,
    ],
    { runsUserCode: true, writes: true },
  );
}

export async function switchToCommit(
  gitPath: string,
  root: string,
  commit: string,
): Promise<void> {
  await runGit(
    gitPath,
    root,
    [
      'switch',
      '-q',
      '--detach',
      '--no-overwrite-ignore',
      '--end-of-options',
      commit,
    ],
    { runsUserCode: true, writes: true },
  );
}

export async function checkoutNewBranch(
  gitPath: string,
  root: string,
  branch: string,
  upstream: string,
): Promise<void> {
  await runGit(
    gitPath,
    root,
    [
      'switch',
      '-q',
      '--no-overwrite-ignore',
      '--track',
      '-c',
      branch,
      '--end-of-options',
      upstream,
    ],
    { runsUserCode: true, writes: true },
  );
}
