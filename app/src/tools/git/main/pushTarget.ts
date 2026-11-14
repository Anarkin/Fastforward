import { commitOf, readUpstream, type Upstream } from './branches';
import { runGit, splitNul } from './run';

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
