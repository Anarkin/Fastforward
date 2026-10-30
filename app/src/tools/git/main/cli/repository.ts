import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { RefInfo, Tracking } from '../../shared/protocol';
import { strings } from '../../../../shared/strings';
import { gitErrorText } from './errorText';
import { runGit, splitNul } from './run';
import { listStashes, type Stash } from './stashes';

export interface Head {
  readonly name?: string;
  readonly commit?: string;
}

export interface Refs {
  readonly head: Head | undefined;
  readonly refs: readonly RefInfo[];
  readonly remotes: readonly string[];
  readonly stashes: readonly Stash[];
  readonly dates: ReadonlyMap<string, number>;
  readonly shallow: string;
  readonly commitGraph: boolean;
}

const noRepository =
  /not a git repository|must be run in a work tree|cannot use bare repository/;

export async function repositoryRoot(
  gitPath: string,
  folder: string,
): Promise<string | undefined> {
  let output: string;
  try {
    output = await runGit(gitPath, folder, [
      'rev-parse',
      '--is-inside-work-tree',
      '--show-cdup',
      '--show-toplevel',
    ]);
  } catch (error) {
    if (noRepository.test(gitErrorText(error)) || !(await isFolder(folder))) {
      return undefined;
    }
    throw error;
  }
  const [inside, up = '', top = ''] = output.split('\n');
  if (inside !== 'true') {
    return undefined;
  }
  const root = path.resolve(folder, up);
  return (await sameFolder(root, top)) ? root : path.resolve(top);
}

export function isFolder(folder: string): Promise<boolean> {
  return fs.stat(folder).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
}

export async function initRepository(
  gitPath: string,
  folder: string,
): Promise<void> {
  if (!(await isFolder(folder))) {
    throw new Error(strings.common.gone(folder));
  }
  await runGit(gitPath, folder, ['init', '--quiet']);
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

export async function readRefs(gitPath: string, root: string): Promise<Refs> {
  const [{ head, shallow, commitGraph }, { refs, dates }, remotes, stashes] =
    await Promise.all([
      readHeadAndShallow(gitPath, root),
      listRefs(gitPath, root),
      listRemotes(gitPath, root),
      listStashes(gitPath, root),
    ]);
  return {
    head,
    refs: refs.map((ref) => withRemote(ref, remotes)),
    remotes,
    stashes,
    dates,
    shallow,
    commitGraph,
  };
}

export async function readHead(
  gitPath: string,
  root: string,
): Promise<Head | undefined> {
  return (await headAndGitPaths(gitPath, root)).head;
}

async function readHeadAndShallow(
  gitPath: string,
  root: string,
): Promise<{ head: Head | undefined; shallow: string; commitGraph: boolean }> {
  const { head, shallowFile, commitGraphFiles } = await headAndGitPaths(
    gitPath,
    root,
  );
  const [shallow, ...graphs] = await Promise.all([
    fs.readFile(path.resolve(root, shallowFile), 'utf8').catch(() => ''),
    ...commitGraphFiles.map((file) =>
      fs.access(path.resolve(root, file)).then(
        () => true,
        () => false,
      ),
    ),
  ]);
  return { head, shallow, commitGraph: graphs.includes(true) };
}

const commitGraphFiles = [
  'objects/info/commit-graph',
  'objects/info/commit-graphs/commit-graph-chain',
];

async function headAndGitPaths(
  gitPath: string,
  root: string,
): Promise<{
  head: Head | undefined;
  shallowFile: string;
  commitGraphFiles: string[];
}> {
  const [branch, pathsAndHash] = await Promise.all([
    runGit(gitPath, root, ['symbolic-ref', '-q', 'HEAD'], {
      okExitCodes: [0, 1],
    }),
    runGit(
      gitPath,
      root,
      [
        'rev-parse',
        ...['shallow', ...commitGraphFiles].flatMap((file) => [
          '--git-path',
          file,
        ]),
        '--verify',
        '--quiet',
        'HEAD',
      ],
      { okExitCodes: [0, 1] },
    ),
  ]);
  const [shallowFile, ...rest] = pathsAndHash.trim().split('\n');
  const graphs = rest.slice(0, commitGraphFiles.length);
  const hash = rest[commitGraphFiles.length];
  const ref = branch.trim();
  const name = ref.startsWith('refs/heads/')
    ? ref.slice('refs/heads/'.length)
    : undefined;
  return {
    head: name || hash ? { name, commit: hash } : undefined,
    shallowFile,
    commitGraphFiles: graphs,
  };
}

function withRemote(ref: RefInfo, remotes: readonly string[]): RefInfo {
  if (ref.kind !== 'remote') {
    return ref;
  }
  const remote = remotes
    .filter((name) => ref.name.startsWith(`${name}/`))
    .reduce<string | undefined>(
      (longest, name) =>
        longest === undefined || name.length > longest.length ? name : longest,
      undefined,
    );
  return remote === undefined ? ref : { ...ref, remote };
}

async function listRefs(
  gitPath: string,
  root: string,
): Promise<{ refs: RefInfo[]; dates: Map<string, number> }> {
  const output = await runGit(gitPath, root, [
    'for-each-ref',
    '--format=%(refname)%00%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)%00%(committerdate:unix)%00%(*committerdate:unix)%00%(symref)%00%(upstream:short)%00%(upstream:track,nobracket)',
    'refs/heads',
    'refs/remotes',
    'refs/tags',
  ]);
  const dates = new Map<string, number>();
  const refs = output.split('\n').flatMap((line): RefInfo[] => {
    const [
      refname,
      object,
      type,
      peeled,
      peeledType,
      date,
      peeledDate,
      symref,
      upstream,
      track,
    ] = splitNul(line);
    if (!refname || !object || (peeled ? peeledType : type) !== 'commit') {
      return [];
    }
    const commit = peeled || object;
    dates.set(commit, Number(peeled ? peeledDate : date));
    if (refname.startsWith('refs/heads/')) {
      const name = refname.slice('refs/heads/'.length);
      return [
        upstream
          ? {
              kind: 'branch',
              name,
              commit,
              tracking: trackingOf(upstream, track),
            }
          : { kind: 'branch', name, commit },
      ];
    }
    if (refname.startsWith('refs/remotes/')) {
      const name = refname.slice('refs/remotes/'.length);
      return symref ? [] : [{ kind: 'remote', name, commit }];
    }
    return [{ kind: 'tag', name: refname.slice('refs/tags/'.length), commit }];
  });
  return { refs, dates };
}

function trackingOf(upstream: string, track = ''): Tracking {
  if (track === 'gone') {
    return { upstream, gone: true };
  }
  const count = (pattern: RegExp) => Number(pattern.exec(track)?.[1] ?? 0);
  return {
    upstream,
    ahead: count(/ahead (\d+)/),
    behind: count(/behind (\d+)/),
  };
}

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

export async function listRemotes(
  gitPath: string,
  root: string,
): Promise<string[]> {
  return (await runGit(gitPath, root, ['remote'])).split('\n').filter(Boolean);
}

const remoteTimeout = 5 * 60_000;

const neverAsk = {
  GCM_INTERACTIVE: 'never',
  GIT_ASKPASS: '',
  SSH_ASKPASS_REQUIRE: 'never',
};

const unchangedRef = new Set(['=', '!']);

const remoteBranches = 'refs/remotes/';

async function remotesSafeToPrune(
  gitPath: string,
  root: string,
  signal: AbortSignal,
): Promise<string[]> {
  const output = await runGit(
    gitPath,
    root,
    [
      'config',
      '-z',
      '--get-regexp',
      '^(fetch\\.prune|remote\\..+\\.(prune|fetch))$',
    ],
    { okExitCodes: [0, 1], signal },
  );
  const written = new Map<string, string[]>();
  const settled = new Set<string>();
  for (const entry of splitNul(output).filter(Boolean)) {
    const end = entry.indexOf('\n');
    const key = end === -1 ? entry : entry.slice(0, end);
    if (key === 'fetch.prune') {
      return [];
    }
    const remote = key.slice('remote.'.length, key.lastIndexOf('.'));
    const refspec = end === -1 ? '' : entry.slice(end + 1);
    if (key.endsWith('.prune')) {
      settled.add(remote);
    } else if (!refspec.startsWith('^')) {
      written.set(remote, [
        ...(written.get(remote) ?? []),
        refspec.replace(/^\+/, '').split(':')[1] ?? '',
      ]);
    }
  }
  return [...written]
    .filter(
      ([remote, refs]) =>
        !settled.has(remote) &&
        refs.every((ref) => ref.startsWith(remoteBranches)),
    )
    .map(([remote]) => remote);
}

const notFetched =
  /^(?:error: )?could not fetch (?:'(.+)' \(exit code: -?\d+\)|(.+))$/gm;

export function remotesNotFetched(said: string): string[] {
  return [...said.matchAll(notFetched)].map(
    (match) => match[1] ?? match[2] ?? '',
  );
}

interface FetchOptions {
  readonly timeout?: number;
  readonly interactive?: boolean;
  readonly stop?: AbortSignal;
}

export function fetchAllRemotes(
  gitPath: string,
  root: string,
  options: FetchOptions = {},
): Promise<boolean> {
  return fetchWith(gitPath, root, ['--all', '--porcelain'], options);
}

export function fetchRemote(
  gitPath: string,
  root: string,
  remote: string,
  options: FetchOptions = {},
): Promise<boolean> {
  return fetchWith(
    gitPath,
    root,
    ['--porcelain', '--end-of-options', remote],
    options,
  );
}

async function fetchWith(
  gitPath: string,
  root: string,
  fetching: readonly string[],
  {
    timeout = remoteTimeout,
    interactive = true,
    stop = new AbortController().signal,
  }: FetchOptions,
): Promise<boolean> {
  const quiet = quietFor(timeout);
  const signal = AbortSignal.any([quiet.stalled, stop]);
  try {
    const pruning = (await remotesSafeToPrune(gitPath, root, signal)).flatMap(
      (remote) => [
        '-c',
        `remote.${remote}.prune=true`,
        '-c',
        `remote.${remote}.pruneTags=false`,
      ],
    );
    const output = await runGit(
      gitPath,
      root,
      [...pruning, 'fetch', '--progress', ...fetching],
      {
        signal,
        env: interactive ? {} : neverAsk,
        runsUserCode: true,
        onActivity: quiet.heard,
        progress: true,
      },
    );
    return output
      .split('\n')
      .some((line) => line !== '' && !unchangedRef.has(line[0]));
  } catch (error) {
    if (quiet.stalled.aborted) {
      throw new Error(strings.errors.fetchStalled(Math.round(timeout / 1000)), {
        cause: error,
      });
    }
    throw error;
  } finally {
    quiet.end();
  }
}

function quietFor(timeout: number): {
  readonly stalled: AbortSignal;
  readonly heard: () => void;
  readonly end: () => void;
} {
  const stalling = new AbortController();
  const timer = setTimeout(() => stalling.abort(), timeout);
  return {
    stalled: stalling.signal,
    heard: () => {
      timer.refresh();
    },
    end: () => clearTimeout(timer),
  };
}

export async function listRemoteTags(
  gitPath: string,
  root: string,
  remote: string,
  {
    interactive = true,
    timeout = remoteTimeout,
    stop = new AbortController().signal,
  } = {},
): Promise<Map<string, string>> {
  const output = await runGit(
    gitPath,
    root,
    ['ls-remote', '--tags', '--end-of-options', remote],
    {
      signal: AbortSignal.any([AbortSignal.timeout(timeout), stop]),
      env: interactive ? {} : neverAsk,
      runsUserCode: true,
    },
  );
  const tags = new Map<string, string>();
  for (const line of output.split('\n')) {
    const [commit, ref] = line.split('\t');
    if (!commit || !ref?.startsWith('refs/tags/')) {
      continue;
    }
    const name = ref.slice('refs/tags/'.length);
    if (name.endsWith('^{}')) {
      tags.set(name.slice(0, -'^{}'.length), commit);
    } else if (!tags.has(name)) {
      tags.set(name, commit);
    }
  }
  return tags;
}

export async function pushRef(
  gitPath: string,
  root: string,
  remote: string,
  localRef: string,
  remoteRef: string,
  {
    publish = false,
    timeout = remoteTimeout,
    stop = new AbortController().signal,
  } = {},
): Promise<void> {
  const quiet = quietFor(timeout);
  try {
    await runGit(
      gitPath,
      root,
      [
        'push',
        '--progress',
        ...(publish ? ['--set-upstream'] : []),
        '--end-of-options',
        remote,
        `${localRef}:${remoteRef}`,
      ],
      {
        signal: AbortSignal.any([quiet.stalled, stop]),
        runsUserCode: true,
        onActivity: quiet.heard,
        progress: true,
      },
    );
  } catch (error) {
    if (quiet.stalled.aborted) {
      throw new Error(strings.errors.pushStalled(Math.round(timeout / 1000)), {
        cause: error,
      });
    }
    throw error;
  } finally {
    quiet.end();
  }
}
