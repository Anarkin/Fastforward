import { runGit, splitNul } from './run';

export type Upstream =
  | { readonly kind: 'detached' }
  | { readonly kind: 'none'; readonly branch: string }
  | { readonly kind: 'gone'; readonly branch: string; readonly name: string }
  | {
      readonly kind: 'found';
      readonly branch: string;
      readonly name: string;
      readonly commit: string;
    };

export async function readUpstream(
  gitPath: string,
  cwd: string,
): Promise<Upstream> {
  const ref = (
    await runGit(gitPath, cwd, ['symbolic-ref', '-q', 'HEAD'], {
      okExitCodes: [0, 1],
    })
  ).trim();
  if (!ref.startsWith('refs/heads/')) {
    return { kind: 'detached' };
  }
  const branch = ref.slice('refs/heads/'.length);
  const [upstream = '', name = ''] = splitNul(
    (
      await runGit(gitPath, cwd, [
        'for-each-ref',
        '--format=%(upstream)%00%(upstream:short)',
        ref,
      ])
    ).trim(),
  );
  if (!upstream) {
    return { kind: 'none', branch };
  }
  const commit = (
    await runGit(
      gitPath,
      cwd,
      [
        'rev-parse',
        '--verify',
        '--quiet',
        '--end-of-options',
        `${upstream}^{commit}`,
      ],
      { okExitCodes: [0, 1] },
    )
  ).trim();
  return commit
    ? { kind: 'found', branch, name, commit }
    : { kind: 'gone', branch, name };
}

export async function aheadBehind(
  gitPath: string,
  cwd: string,
  ref: string,
  upstream: string,
): Promise<{ ahead: number; behind: number }> {
  let output: string;
  try {
    output = await runGit(gitPath, cwd, [
      'rev-list',
      '--left-right',
      '--count',
      `${ref}...${upstream}`,
      '--',
    ]);
  } catch (error) {
    const exist = await Promise.all(
      [ref, upstream].map((name) =>
        runGit(gitPath, cwd, ['rev-parse', '--verify', '--quiet', name], {
          okExitCodes: [0, 1],
        }).then((hash) => hash.trim() !== ''),
      ),
    );
    if (exist.every(Boolean)) {
      throw error;
    }
    return { ahead: 0, behind: 0 };
  }
  const [ahead, behind] = output.trim().split(/\s+/).map(Number);
  return { ahead: ahead || 0, behind: behind || 0 };
}

export async function fastForward(
  gitPath: string,
  cwd: string,
  ref: string,
): Promise<void> {
  await runGit(gitPath, cwd, ['merge', '--ff-only', ref], {
    runsHooks: true,
    writes: true,
  });
}

export async function remoteDefaultBranches(
  gitPath: string,
  cwd: string,
): Promise<string[]> {
  const output = await runGit(gitPath, cwd, [
    'for-each-ref',
    '--format=%(refname)%00%(symref)',
    'refs/remotes/',
  ]);
  return output.split('\n').flatMap((line) => {
    const [refname, symref] = splitNul(line);
    return refname?.endsWith('/HEAD') && symref?.startsWith('refs/remotes/')
      ? [symref.slice('refs/remotes/'.length)]
      : [];
  });
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
