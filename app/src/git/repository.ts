import * as path from 'node:path';
import type { RefInfo } from '../shared/protocol';
import type { Head } from '../refs';
import { runGit, splitNul } from './run';

export interface Refs {
  readonly head: Head | undefined;
  readonly refs: readonly RefInfo[];
}

export async function repositoryRoot(
  gitPath: string,
  folder: string,
): Promise<string | undefined> {
  try {
    const [inside, up = ''] = (
      await runGit(gitPath, folder, [
        'rev-parse',
        '--is-inside-work-tree',
        '--show-cdup',
      ])
    ).split('\n');
    return inside === 'true' ? path.resolve(folder, up) : undefined;
  } catch {
    return undefined;
  }
}

export async function readRefs(gitPath: string, root: string): Promise<Refs> {
  const [head, refs, remotes] = await Promise.all([
    readHead(gitPath, root),
    listRefs(gitPath, root),
    runGit(gitPath, root, ['remote']),
  ]);
  const names = remotes.split('\n').filter(Boolean);
  return { head, refs: refs.map((ref) => withRemote(ref, names)) };
}

export async function readHead(
  gitPath: string,
  root: string,
): Promise<Head | undefined> {
  const [branch, commit] = await Promise.all([
    runGit(gitPath, root, ['symbolic-ref', '-q', 'HEAD'], {
      okExitCodes: [0, 1],
    }),
    runGit(gitPath, root, ['rev-parse', '-q', '--verify', 'HEAD^{commit}'], {
      okExitCodes: [0, 1],
    }),
  ]);
  const ref = branch.trim();
  const name = ref.startsWith('refs/heads/')
    ? ref.slice('refs/heads/'.length)
    : undefined;
  const hash = commit.trim() || undefined;
  return name || hash ? { name, commit: hash } : undefined;
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

async function listRefs(gitPath: string, root: string): Promise<RefInfo[]> {
  const output = await runGit(gitPath, root, [
    'for-each-ref',
    '--format=%(refname)%00%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)',
    'refs/heads',
    'refs/remotes',
    'refs/tags',
  ]);
  return output.split('\n').flatMap((line): RefInfo[] => {
    const [refname, object, type, peeled, peeledType] = splitNul(line);
    if (!refname || !object || (peeled ? peeledType : type) !== 'commit') {
      return [];
    }
    const commit = peeled || object;
    if (refname.startsWith('refs/heads/')) {
      return [
        { kind: 'branch', name: refname.slice('refs/heads/'.length), commit },
      ];
    }
    if (refname.startsWith('refs/remotes/')) {
      const name = refname.slice('refs/remotes/'.length);
      return name.endsWith('/HEAD') ? [] : [{ kind: 'remote', name, commit }];
    }
    return [{ kind: 'tag', name: refname.slice('refs/tags/'.length), commit }];
  });
}

export async function switchToBranch(
  gitPath: string,
  root: string,
  branch: string,
): Promise<void> {
  await runGit(gitPath, root, ['switch', '-q', '--end-of-options', branch]);
}

export async function switchToCommit(
  gitPath: string,
  root: string,
  commit: string,
): Promise<void> {
  await runGit(gitPath, root, [
    'switch',
    '-q',
    '--detach',
    '--end-of-options',
    commit,
  ]);
}

export async function checkoutNewBranch(
  gitPath: string,
  root: string,
  branch: string,
  upstream: string,
): Promise<void> {
  await runGit(gitPath, root, [
    'switch',
    '-q',
    '--track',
    '-c',
    branch,
    '--end-of-options',
    upstream,
  ]);
}

const fetchTimeout = 5 * 60_000;

export async function fetchAllRemotes(
  gitPath: string,
  root: string,
  { timeout = fetchTimeout, interactive = true } = {},
): Promise<void> {
  const signal = AbortSignal.timeout(timeout);
  try {
    await runGit(gitPath, root, ['fetch', '--all', '--prune'], {
      signal,
      env: interactive ? {} : { GCM_INTERACTIVE: 'never' },
    });
  } catch (error) {
    if (signal.aborted) {
      throw new Error(
        `git fetch timed out after ${Math.round(timeout / 1000)} seconds`,
        { cause: error },
      );
    }
    throw error;
  }
}
