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
  const children = childrenOf(history);
  const parents = parentsOf(history);
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
        if (parents.get(at)?.[0] !== parent) {
          merges.push(at);
        }
        at = parent;
      }
      return merges;
    }
  }
  return [];
}

const knownChildren = new WeakMap<
  readonly HistoryEntry[],
  ReadonlyMap<string, readonly string[]>
>();

function childrenOf(
  history: readonly HistoryEntry[],
): ReadonlyMap<string, readonly string[]> {
  const known = knownChildren.get(history);
  if (known) {
    return known;
  }
  const result = new Map<string, string[]>();
  for (const entry of history) {
    for (const parent of entry.parents) {
      const siblings = result.get(parent);
      if (siblings) {
        siblings.push(entry.hash);
      } else {
        result.set(parent, [entry.hash]);
      }
    }
  }
  knownChildren.set(history, result);
  return result;
}

const knownParents = new WeakMap<
  readonly HistoryEntry[],
  ReadonlyMap<string, readonly string[]>
>();

function parentsOf(
  history: readonly HistoryEntry[],
): ReadonlyMap<string, readonly string[]> {
  const known = knownParents.get(history);
  if (known) {
    return known;
  }
  const result = new Map(history.map((entry) => [entry.hash, entry.parents]));
  knownParents.set(history, result);
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
  const parents = parentsOf(history);
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
