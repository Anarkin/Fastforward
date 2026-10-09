import { Commits } from './commits';

export interface Extension {
  readonly older: Commits;
  readonly oldHeads: ReadonlySet<string>;
  readonly oldTimes: ReadonlyMap<string, number>;
  readonly newer: Commits;
  readonly tips: ReadonlySet<string>;
}

// Git's date order puts the newer commits above the older ones only when each
// is newer than every old tip, the only old commits waiting beside them, and
// no tie of times lets git take either first, as it queues the tips given
// apart from the history in another order than when given them all
export function extendHistory({
  older,
  oldHeads,
  oldTimes,
  newer,
  tips,
}: Extension): Commits | undefined {
  const { times } = newer;
  if (!times || !keepsHistory({ older, oldHeads, newer, tips })) {
    return undefined;
  }
  const builtOn = (head: string) => isBuiltOn(newer, head);
  const headTimes = [...oldHeads].map((head) => oldTimes.get(head));
  if (headTimes.some((time) => time === undefined)) {
    return undefined;
  }
  const counts = new Map<number | undefined, number>();
  for (const time of headTimes) {
    counts.set(time, (counts.get(time) ?? 0) + 1);
  }
  if (
    [...oldHeads].some(
      (head) => builtOn(head) && (counts.get(oldTimes.get(head)) ?? 0) > 1,
    )
  ) {
    return undefined;
  }
  for (let at = 0; at < newer.length; at++) {
    if (older.has(newer.hashAt(at))) {
      return undefined;
    }
  }
  if (
    !aboveOldTips(newer, times, oldHeads, oldTimes) ||
    !inOneLineByTime(newer, times)
  ) {
    return undefined;
  }
  return Commits.replacingTop(newer, older, 0);
}

export function keepsHistory({
  older,
  oldHeads,
  newer,
  tips,
}: Omit<Extension, 'oldTimes'>): boolean {
  return (
    newer.length > 0 &&
    [...tips].every((tip) => older.has(tip) || newer.has(tip)) &&
    [...oldHeads].every((head) => tips.has(head) || isBuiltOn(newer, head))
  );
}

function isBuiltOn(newer: Commits, head: string): boolean {
  return (newer.indexOf(head) ?? 0) >= newer.length;
}

export interface Region extends Omit<Extension, 'oldTimes'> {
  readonly region: Commits;
  readonly since: number;
  readonly belowTimes: ReadonlyMap<string, number>;
}

// Git's date order puts the commits since the oldest new one first, in the
// order git gives them read alone, and the older ones below as before, when
// those since are the top of the old list, those below are all older, and no
// tie of times among them or among those just below lets git queue them
// differently than when reading the whole history
export function regionHistory({
  older,
  oldHeads,
  newer,
  tips,
  region,
  since,
  belowTimes,
}: Region): Commits | undefined {
  const { times } = region;
  if (!times || !keepsHistory({ older, oldHeads, newer, tips })) {
    return undefined;
  }
  for (let at = 0; at < newer.length; at++) {
    if (!region.has(newer.hashAt(at))) {
      return undefined;
    }
  }
  let dropped = 0;
  for (let at = 0; at < region.length; at++) {
    if (older.has(region.hashAt(at))) {
      dropped++;
    }
  }
  for (let at = 0; at < region.length; at++) {
    const old = older.indexOf(region.hashAt(at)) ?? older.length;
    if (old < older.length && old >= dropped) {
      return undefined;
    }
  }
  const below = new Set<number>();
  for (let at = region.length; at < region.size; at++) {
    const time = belowTimes.get(region.hashAt(at));
    if (time === undefined || time >= since || below.has(time)) {
      return undefined;
    }
    below.add(time);
  }
  if (!inOneLineByTime(region, times)) {
    return undefined;
  }
  return Commits.replacingTop(region, older, dropped);
}

function aboveOldTips(
  newer: Commits,
  times: Int32Array,
  oldHeads: ReadonlySet<string>,
  oldTimes: ReadonlyMap<string, number>,
): boolean {
  let oldest = Infinity;
  for (const time of times) {
    oldest = Math.min(oldest, time);
  }
  for (const head of oldHeads) {
    const time = oldTimes.get(head) ?? Infinity;
    if (time < oldest) {
      continue;
    }
    const builtOn = descendantsOf(newer, newer.indexOf(head));
    for (let at = 0; at < newer.length; at++) {
      if (times[at] <= time && !builtOn[at]) {
        return false;
      }
    }
  }
  return true;
}

function descendantsOf(
  { length, starts, parents }: Commits,
  head: number | undefined,
): Uint8Array {
  const descends = new Uint8Array(length);
  if (head === undefined) {
    return descends;
  }
  for (let at = length - 1; at >= 0; at--) {
    for (let parent = starts[at]; parent < starts[at + 1]; parent++) {
      const of = parents[parent];
      if (of === head || (of < length && descends[of])) {
        descends[at] = 1;
        break;
      }
    }
  }
  return descends;
}

function inOneLineByTime(commits: Commits, times: Int32Array): boolean {
  const last = new Map<number, number>();
  const seen = new Int32Array(commits.length);
  let search = 0;
  for (let at = 0; at < times.length; at++) {
    const before = last.get(times[at]);
    last.set(times[at], at);
    if (
      before !== undefined &&
      !descendsFrom(commits, before, at, seen, ++search)
    ) {
      return false;
    }
  }
  return true;
}

// A parent comes after its children in git's date order, so no commit past
// the ancestor can lead to it
function descendsFrom(
  { length, starts, parents }: Commits,
  child: number,
  ancestor: number,
  seen: Int32Array,
  search: number,
): boolean {
  const stack = [child];
  for (let at = stack.pop(); at !== undefined; at = stack.pop()) {
    if (at === ancestor) {
      return true;
    }
    if (at > ancestor || at >= length || seen[at] === search) {
      continue;
    }
    seen[at] = search;
    for (let parent = starts[at]; parent < starts[at + 1]; parent++) {
      stack.push(parents[parent]);
    }
  }
  return false;
}
