import type { HistoryEntry } from '../git/history';

export interface ShownEntry extends HistoryEntry {
  readonly merge?: 'collapsed' | 'expanded';
  readonly hidden?: number;
}

export function headsOf(history: readonly HistoryEntry[]): Set<string> {
  const parents = new Set(history.flatMap((entry) => entry.parents));
  return new Set(
    history
      .filter((entry) => !parents.has(entry.hash))
      .map((entry) => entry.hash),
  );
}

export function mergesHiding(
  history: readonly HistoryEntry[],
  shown: { has(hash: string): boolean },
  target: string,
): string[] {
  const { children, firstParents } = linksOf(history);
  const cameFrom = new Map<string, string>();
  const queue = [target];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const child of children.get(next) ?? []) {
      if (cameFrom.has(child)) {
        continue;
      }
      cameFrom.set(child, next);
      if (!shown.has(child)) {
        queue.push(child);
        continue;
      }
      const merges: string[] = [];
      for (let at = child; at !== target;) {
        const parent = cameFrom.get(at);
        if (parent === undefined) {
          break;
        }
        if (firstParents.get(at) !== parent) {
          merges.push(at);
        }
        at = parent;
      }
      return merges;
    }
  }
  return [];
}

interface Links {
  readonly children: ReadonlyMap<string, readonly string[]>;
  readonly firstParents: ReadonlyMap<string, string | undefined>;
  readonly parents: ReadonlyMap<string, readonly string[]>;
}

const links = new WeakMap<readonly HistoryEntry[], Links>();

function linksOf(history: readonly HistoryEntry[]): Links {
  const known = links.get(history);
  if (known) {
    return known;
  }
  const children = new Map<string, string[]>();
  const firstParents = new Map<string, string | undefined>();
  const parents = new Map<string, readonly string[]>();
  for (const entry of history) {
    firstParents.set(entry.hash, entry.parents[0]);
    parents.set(entry.hash, entry.parents);
    for (const parent of entry.parents) {
      const siblings = children.get(parent);
      if (siblings) {
        siblings.push(entry.hash);
      } else {
        children.set(parent, [entry.hash]);
      }
    }
  }
  const result = { children, firstParents, parents };
  links.set(history, result);
  return result;
}

export function showHistory(
  history: readonly HistoryEntry[],
  tips: ReadonlySet<string>,
  isExpanded: (hash: string) => boolean,
): ShownEntry[] {
  const shown = new Set(tips);
  for (const entry of history) {
    if (!shown.has(entry.hash)) {
      continue;
    }
    const parents =
      entry.parents.length > 1 && isExpanded(entry.hash)
        ? entry.parents
        : entry.parents.slice(0, 1);
    for (const parent of parents) {
      shown.add(parent);
    }
  }
  const hidden = countHidden(history, shown);
  return history.flatMap((entry): ShownEntry[] => {
    if (!shown.has(entry.hash)) {
      return [];
    }
    const parents = entry.parents.filter((parent) => shown.has(parent));
    if (entry.parents.length < 2) {
      return [{ hash: entry.hash, parents }];
    }
    return [
      {
        hash: entry.hash,
        parents,
        merge: isExpanded(entry.hash) ? 'expanded' : 'collapsed',
        hidden: hidden.get(entry.hash),
      },
    ];
  });
}

function countHidden(
  history: readonly HistoryEntry[],
  shown: ReadonlySet<string>,
): Map<string, number> {
  const { parents } = linksOf(history);
  const counted = new Set<string>();
  const counts = new Map<string, number>();
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index];
    if (!shown.has(entry.hash) || entry.parents.length < 2) {
      continue;
    }
    let count = 0;
    const stack = entry.parents.slice(1);
    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
      if (shown.has(next) || counted.has(next)) {
        continue;
      }
      counted.add(next);
      count++;
      stack.push(...(parents.get(next) ?? []));
    }
    if (count > 0) {
      counts.set(entry.hash, count);
    }
  }
  return counts;
}
