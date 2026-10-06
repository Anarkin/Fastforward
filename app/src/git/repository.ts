import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { RefInfo } from '../shared/protocol';
import { strings } from '../shared/strings';
import { gitErrorText } from './errorText';
import { headCommit } from './history';
import { runGit, splitNul } from './run';
import { listStashes, type Stash } from './stashes';

export interface Head {
  readonly name?: string;
  readonly commit?: string;
}

export interface Refs {
  readonly head: Head | undefined;
  readonly refs: readonly RefInfo[];
  readonly stashes: readonly Stash[];
}

// What git says in English, which LC_ALL=C has it say in whatever the locale
const noRepository = /not a git repository|must be run in a work tree/;

export async function repositoryRoot(
  gitPath: string,
  folder: string,
): Promise<string | undefined> {
  let output: string;
  try {
    output = await runGit(
      gitPath,
      folder,
      ['rev-parse', '--is-inside-work-tree', '--show-cdup', '--show-toplevel'],
      { env: { LC_ALL: 'C' } },
    );
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

// Git walks up from the folder after following links, so going up from the
// folder as given only reaches the root when no link was followed; that keeps
// the folder's own spelling, unlike the top level git gives
export async function sameFolder(a: string, b: string): Promise<boolean> {
  try {
    const [realA, realB] = await Promise.all([fs.realpath(a), fs.realpath(b)]);
    return realA === realB;
  } catch {
    return false;
  }
}

export async function readRefs(gitPath: string, root: string): Promise<Refs> {
  const [head, refs, remotes, stashes] = await Promise.all([
    readHead(gitPath, root),
    listRefs(gitPath, root),
    runGit(gitPath, root, ['remote']),
    listStashes(gitPath, root),
  ]);
  const names = remotes.split('\n').filter(Boolean);
  return {
    head,
    refs: refs.map((ref) => withRemote(ref, names)),
    stashes,
  };
}

export async function readHead(
  gitPath: string,
  root: string,
): Promise<Head | undefined> {
  const [branch, hash] = await Promise.all([
    runGit(gitPath, root, ['symbolic-ref', '-q', 'HEAD'], {
      okExitCodes: [0, 1],
    }),
    headCommit(gitPath, root),
  ]);
  const ref = branch.trim();
  const name = ref.startsWith('refs/heads/')
    ? ref.slice('refs/heads/'.length)
    : undefined;
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
  await runGit(gitPath, root, ['switch', '-q', '--end-of-options', branch], {
    runsHooks: true,
  });
}

export async function switchToCommit(
  gitPath: string,
  root: string,
  commit: string,
): Promise<void> {
  await runGit(
    gitPath,
    root,
    ['switch', '-q', '--detach', '--end-of-options', commit],
    { runsHooks: true },
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
    ['switch', '-q', '--track', '-c', branch, '--end-of-options', upstream],
    { runsHooks: true },
  );
}

const fetchTimeout = 5 * 60_000;

// An empty GIT_ASKPASS keeps git from core.askPass and SSH_ASKPASS too
const neverAsk = {
  GCM_INTERACTIVE: 'never',
  GIT_ASKPASS: '',
  SSH_ASKPASS_REQUIRE: 'never',
};

export async function fetchAllRemotes(
  gitPath: string,
  root: string,
  { timeout = fetchTimeout, interactive = true } = {},
): Promise<void> {
  const signal = AbortSignal.timeout(timeout);
  try {
    await runGit(gitPath, root, ['fetch', '--all', '--prune'], {
      signal,
      env: interactive ? {} : neverAsk,
      runsHooks: true,
    });
  } catch (error) {
    if (signal.aborted) {
      throw new Error(
        strings.errors.fetchTimedOut(Math.round(timeout / 1000)),
        { cause: error },
      );
    }
    throw error;
  }
}
