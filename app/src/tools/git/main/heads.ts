import type { Commits } from './commits';

const knownHeads = new WeakMap<Commits, readonly string[]>();

export function rememberHeads(
  commits: Commits,
  heads: readonly string[],
): void {
  knownHeads.set(commits, heads);
}

export function headsOf(commits: Commits): Set<string> {
  const known = knownHeads.get(commits);
  if (known !== undefined) {
    return new Set(known);
  }
  const { length, parents } = commits;
  const hasChild = new Uint8Array(length);
  for (let index = 0; index < parents.length; index++) {
    const parent = parents[index];
    if (parent < length) {
      hasChild[parent] = 1;
    }
  }
  const heads = new Set<string>();
  for (let at = 0; at < length; at++) {
    if (!hasChild[at]) {
      heads.add(commits.hashAt(at));
    }
  }
  return heads;
}
