import { fsPromises as fs } from '../../../lib/main/files';
import * as path from 'node:path';
import type { RefInfo, Tracking } from '../shared/protocol';
import { runGit } from './run';
import { splitNul } from './splitNul';
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

export async function listRemotes(
  gitPath: string,
  root: string,
): Promise<string[]> {
  return (await runGit(gitPath, root, ['remote'])).split('\n').filter(Boolean);
}
