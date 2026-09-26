import type { HistoryEntry } from './show';

// A commit in the history as shown, which can leave out what collapsed merges
// brought in
export interface ShownEntry extends HistoryEntry {
  // Set on merge commits; collapsed ones hide commits of the merged branch
  readonly merge?: 'collapsed' | 'expanded';
  // How many commits a collapsed merge hides
  readonly hidden?: number;
}

// The commits nothing is built on yet: the tips of branches that aren't merged
// anywhere; a merged branch's tip has the merge as its child
export function headsOf(history: readonly HistoryEntry[]): Set<string> {
  const parents = new Set(history.flatMap((entry) => entry.parents));
  return new Set(
    history
      .filter((entry) => !parents.has(entry.hash))
      .map((entry) => entry.hash),
  );
}

// The merges to expand so that a hidden commit is shown: walking up from the
// commit through its children to the nearest shown commit, every step into a
// merge through a parent other than its first is a merge that hides it
export function mergesHiding(
  history: readonly HistoryEntry[],
  shown: ReadonlySet<string>,
  target: string,
): string[] {
  const children = new Map<string, string[]>();
  const firstParents = new Map<string, string | undefined>();
  for (const entry of history) {
    firstParents.set(entry.hash, entry.parents[0]);
    for (const parent of entry.parents) {
      children.set(parent, [...(children.get(parent) ?? []), entry.hash]);
    }
  }
  // Breadth first, so the nearest shown commit is found
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

// The history with merges collapsed like Sublime Merge does: a commit is shown
// if it is one of the tips, or the first parent of a shown commit, or any
// parent of a shown merge that is expanded; the history is newest first, so
// children come before their parents and one pass finds them all
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
    // Lines only go to parents that are shown
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

// How many hidden commits each shown merge brought in; a hidden commit counts
// for the newest merge that reaches it, so every one is visited only once
function countHidden(
  history: readonly HistoryEntry[],
  shown: ReadonlySet<string>,
): Map<string, number> {
  const parentsOf = new Map(
    history.map((entry) => [entry.hash, entry.parents]),
  );
  const counted = new Set<string>();
  const counts = new Map<string, number>();
  for (const entry of history) {
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
      stack.push(...(parentsOf.get(next) ?? []));
    }
    if (count > 0) {
      counts.set(entry.hash, count);
    }
  }
  return counts;
}
