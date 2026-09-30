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
    const up = (
      await runGit(gitPath, folder, ['rev-parse', '--show-cdup'])
    ).trim();
    return path.resolve(folder, up);
  } catch {
    return undefined;
  }
}

export async function readRefs(gitPath: string, root: string): Promise<Refs> {
  const [head, refs] = await Promise.all([
    readHead(gitPath, root),
    listRefs(gitPath, root),
  ]);
  return { head, refs };
}

export async function readHead(
  gitPath: string,
  root: string,
): Promise<Head | undefined> {
  const [branch, commit] = await Promise.all([
    runGit(gitPath, root, ['symbolic-ref', '-q', '--short', 'HEAD'], {
      okExitCodes: [0, 1],
    }),
    runGit(gitPath, root, ['rev-parse', '-q', '--verify', 'HEAD^{commit}'], {
      okExitCodes: [0, 1],
    }),
  ]);
  const name = branch.trim() || undefined;
  const hash = commit.trim() || undefined;
  return name || hash ? { name, commit: hash } : undefined;
}

async function listRefs(gitPath: string, root: string): Promise<RefInfo[]> {
  const output = await runGit(gitPath, root, [
    'for-each-ref',
    '--format=%(refname)%00%(objectname)%00%(*objectname)',
    'refs/heads',
    'refs/remotes',
    'refs/tags',
  ]);
  return output.split('\n').flatMap((line): RefInfo[] => {
    const [refname, object, peeled] = splitNul(line);
    if (!refname || !object) {
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

export async function checkoutRef(
  gitPath: string,
  root: string,
  ref: string,
): Promise<void> {
  await runGit(gitPath, root, ['checkout', '-q', ref, '--']);
}

export async function checkoutNewBranch(
  gitPath: string,
  root: string,
  branch: string,
  upstream: string,
): Promise<void> {
  await runGit(gitPath, root, [
    'checkout',
    '-q',
    '--track',
    '-b',
    branch,
    upstream,
    '--',
  ]);
}

export async function fetchAllRemotes(
  gitPath: string,
  root: string,
): Promise<void> {
  await runGit(gitPath, root, ['fetch', '--all', '--prune']);
}
