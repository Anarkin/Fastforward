import { gitErrorText } from './errorText';
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
      readonly remote: string;
      readonly remoteRef: string;
    };

export async function readUpstream(
  gitPath: string,
  cwd: string,
  named?: string,
): Promise<Upstream> {
  const ref =
    named === undefined
      ? (
          await runGit(gitPath, cwd, ['symbolic-ref', '-q', 'HEAD'], {
            okExitCodes: [0, 1],
          })
        ).trim()
      : `refs/heads/${named}`;
  if (!ref.startsWith('refs/heads/')) {
    return { kind: 'detached' };
  }
  const branch = ref.slice('refs/heads/'.length);
  const [upstream = '', name = '', remote = '', remoteRef = ''] = splitNul(
    (
      await runGit(gitPath, cwd, [
        'for-each-ref',
        '--format=%(upstream)%00%(upstream:short)%00%(upstream:remotename)%00%(upstream:remoteref)',
        ref,
      ])
    ).trim(),
  );
  if (!upstream) {
    return { kind: 'none', branch };
  }
  const commit = await commitOf(gitPath, cwd, upstream);
  return commit
    ? { kind: 'found', branch, name, commit, remote, remoteRef }
    : { kind: 'gone', branch, name };
}

export interface PushSettings {
  readonly pushDefault: string;
  readonly fetchRemote: string;
  readonly pushRemote: string;
  readonly merges: readonly string[];
}

export interface PushDestination {
  readonly remote: string;
  readonly remoteRef: string;
}

export type PushRefusal = 'otherName' | 'setting';

export function pushDestination(
  branch: string,
  { pushDefault, fetchRemote, pushRemote, merges }: PushSettings,
): PushDestination | PushRefusal {
  const current = { remote: pushRemote, remoteRef: `refs/heads/${branch}` };
  const triangular = pushRemote !== fetchRemote;
  const [merge] = merges;
  switch (pushDefault) {
    case 'current':
    case 'matching':
      return current;
    case 'nothing':
      return 'setting';
    case 'upstream':
    case 'tracking':
      return triangular || merge === undefined || merges.length > 1
        ? 'setting'
        : { remote: fetchRemote, remoteRef: merge };
    default:
      if (triangular) {
        return current;
      }
      if (merge === undefined || merges.length > 1) {
        return 'setting';
      }
      return merge === current.remoteRef ? current : 'otherName';
  }
}

export type PushTarget =
  | Exclude<Upstream, { kind: 'found' }>
  | { readonly kind: 'local'; readonly branch: string; readonly name: string }
  | {
      readonly kind: 'refused';
      readonly branch: string;
      readonly name: string;
      readonly why: PushRefusal;
    }
  | {
      readonly kind: 'found';
      readonly branch: string;
      readonly name: string;
      readonly remote: string;
      readonly remoteRef: string;
      readonly commit: string | undefined;
    };

async function branchPushSettings(
  gitPath: string,
  cwd: string,
  branch: string,
): Promise<Omit<PushSettings, 'pushRemote'>> {
  const output = await runGit(
    gitPath,
    cwd,
    [
      'config',
      '-z',
      '--get-regexp',
      '^(push\\.default|branch\\..+\\.(remote|merge))$',
    ],
    { okExitCodes: [0, 1] },
  );
  let pushDefault = 'simple';
  let fetchRemote = 'origin';
  const merges: string[] = [];
  for (const entry of splitNul(output).filter(Boolean)) {
    const end = entry.indexOf('\n');
    const key = end === -1 ? entry : entry.slice(0, end);
    const value = end === -1 ? '' : entry.slice(end + 1);
    if (key === 'push.default') {
      pushDefault = value;
    } else if (key === `branch.${branch}.remote`) {
      fetchRemote = value;
    } else if (key === `branch.${branch}.merge`) {
      merges.push(value);
    }
  }
  return { pushDefault, fetchRemote, merges };
}

async function commitOf(
  gitPath: string,
  cwd: string,
  ref: string,
): Promise<string | undefined> {
  return (
    (
      await runGit(
        gitPath,
        cwd,
        [
          'rev-parse',
          '--verify',
          '--quiet',
          '--end-of-options',
          `${ref}^{commit}`,
        ],
        { okExitCodes: [0, 1] },
      )
    ).trim() || undefined
  );
}

export async function readPushTarget(
  gitPath: string,
  cwd: string,
  named?: string,
): Promise<PushTarget> {
  const upstream = await readUpstream(gitPath, cwd, named);
  if (upstream.kind === 'detached' || upstream.kind === 'gone') {
    return upstream;
  }
  const { branch } = upstream;
  if (upstream.kind === 'found' && upstream.remote === '.') {
    return { kind: 'local', branch, name: upstream.name };
  }
  const [settings, [tracking = '', trackingName = '', pushRemote = '']] =
    await Promise.all([
      branchPushSettings(gitPath, cwd, branch),
      runGit(gitPath, cwd, [
        '-c',
        'push.default=current',
        'for-each-ref',
        '--format=%(push)%00%(push:short)%00%(push:remotename)',
        `refs/heads/${branch}`,
      ]).then((output) => splitNul(output.trim())),
    ]);
  if (upstream.kind === 'none' && settings.merges.length === 0) {
    return upstream;
  }
  const upstreamName =
    upstream.kind === 'found'
      ? upstream.name
      : `${settings.fetchRemote}/${(settings.merges[0] ?? '').replace(/^refs\/heads\//, '')}`;
  const destination = pushDestination(branch, { ...settings, pushRemote });
  if (typeof destination === 'string') {
    return { kind: 'refused', branch, name: upstreamName, why: destination };
  }
  if (
    upstream.kind === 'found' &&
    destination.remote === upstream.remote &&
    destination.remoteRef === upstream.remoteRef
  ) {
    return {
      kind: 'found',
      branch,
      ...destination,
      name: upstream.name,
      commit: upstream.commit,
    };
  }
  const tracked =
    destination.remote === pushRemote &&
    destination.remoteRef === `refs/heads/${branch}` &&
    tracking !== '';
  return {
    kind: 'found',
    branch,
    ...destination,
    name: tracked
      ? trackingName
      : `${destination.remote}/${destination.remoteRef.replace(/^refs\/heads\//, '')}`,
    commit: tracked ? await commitOf(gitPath, cwd, tracking) : undefined,
  };
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
  await runGit(
    gitPath,
    cwd,
    ['merge', '--ff-only', '--no-overwrite-ignore', ref],
    {
      runsUserCode: true,
      writes: true,
    },
  );
}

export type MovedBranch = 'moved' | 'inUse' | 'movedOn';

const branchInUse = /^fatal: refusing to fetch into branch /m;

const branchMovedOn = /\[rejected\][^\n]*\(non-fast-forward\)/;

export async function moveBranch(
  gitPath: string,
  cwd: string,
  branch: string,
  to: string,
): Promise<MovedBranch> {
  try {
    await runGit(
      gitPath,
      cwd,
      [
        'fetch',
        '--no-write-fetch-head',
        '--no-tags',
        '--no-prune',
        '--no-recurse-submodules',
        '--no-auto-maintenance',
        '--end-of-options',
        '.',
        `${to}:refs/heads/${branch}`,
      ],
      { writes: true },
    );
    return 'moved';
  } catch (error) {
    const said = gitErrorText(error);
    if (branchInUse.test(said)) {
      return 'inUse';
    }
    if (branchMovedOn.test(said)) {
      return 'movedOn';
    }
    throw error;
  }
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
