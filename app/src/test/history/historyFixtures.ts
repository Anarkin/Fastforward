import type { HistoryEntry } from '../../git/history';
import type { Commits } from '../../history/commits';
import { Graph, type GraphSource } from '../../history/graph';
import type { Shown, ShownEntry } from '../../history/merges';

export function entriesOf(commits: Commits): HistoryEntry[] {
  return Array.from({ length: commits.length }, (_, at) => {
    const parents: string[] = [];
    for (
      let parent = commits.starts[at];
      parent < commits.starts[at + 1];
      parent++
    ) {
      parents.push(commits.hashAt(commits.parents[parent]));
    }
    return { hash: commits.hashAt(at), parents };
  });
}

export function rowsOf(shown: Shown): ShownEntry[] {
  return Array.from({ length: shown.length }, (_, row) => shown.entry(row));
}

export function graphOf(
  entries: readonly ShownEntry[],
  {
    head,
    stashes,
    checkpointEvery,
    partial,
  }: {
    head?: string;
    stashes?: ReadonlySet<string>;
    checkpointEvery?: number;
    partial?: boolean;
  } = {},
): Graph {
  const keys = new Map<string, number>();
  const key = (hash: string) => {
    let known = keys.get(hash);
    if (known === undefined) {
      known = keys.size;
      keys.set(hash, known);
    }
    return known;
  };
  for (const entry of entries) {
    key(entry.hash);
  }
  const source: GraphSource = {
    length: entries.length,
    key: (row) => key(entries[row].hash),
    parents: (row) => entries[row].parents.map(key),
    merge: (row) => entries[row].merge,
    hidden: (row) => entries[row].hidden,
  };
  return new Graph(source, {
    head: head === undefined ? undefined : key(head),
    stashes: stashes && new Set([...stashes].map(key)),
    checkpointEvery,
    partial,
  });
}
