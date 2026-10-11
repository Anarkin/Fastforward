import { Commits } from './commits';

export interface Extension {
  readonly older: Commits;
  readonly oldHeads: ReadonlySet<string>;
  readonly oldTimes: ReadonlyMap<string, number>;
  readonly newer: Commits;
  readonly tips: ReadonlySet<string>;
}

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
  if (
    !tipsBuiltOnUntied({ oldHeads, oldTimes, newer }) ||
    !noneIn(newer, older)
  ) {
    return undefined;
  }
  if (
    !keepsTiedOldTips({ older, oldHeads, oldTimes, newer, tips }) ||
    !aboveOldTips(newer, times, oldHeads, oldTimes) ||
    !inOneLineByTime(newer, times)
  ) {
    return undefined;
  }
  return Commits.replacingTop(newer, older, 0);
}

function tipsBuiltOnUntied({
  oldHeads,
  oldTimes,
  newer,
}: Pick<Extension, 'oldHeads' | 'oldTimes' | 'newer'>): boolean {
  const headTimes = [...oldHeads].map((head) => oldTimes.get(head));
  if (headTimes.some((time) => time === undefined)) {
    return false;
  }
  const counts = new Map<number | undefined, number>();
  for (const time of headTimes) {
    counts.set(time, (counts.get(time) ?? 0) + 1);
  }
  return ![...oldHeads].some(
    (head) =>
      isBuiltOn(newer, head) && (counts.get(oldTimes.get(head)) ?? 0) > 1,
  );
}

export function ranksOf(tips: Iterable<string>): Map<string, number> {
  return new Map(Array.from(tips, (tip, rank) => [tip, rank]));
}

export function keepsTiedOrder(
  heads: Iterable<string>,
  timeOfHead: (head: string) => number | undefined,
  rankBefore: (head: string) => number | undefined,
  rankAfter: (head: string) => number | undefined,
): boolean {
  const ranked: { time: number | undefined; was: number; is: number }[] = [];
  for (const head of heads) {
    const was = rankBefore(head);
    const is = rankAfter(head);
    if (was === undefined || is === undefined) {
      return false;
    }
    ranked.push({ time: timeOfHead(head), was, is });
  }
  ranked.sort((a, b) => a.was - b.was);
  const lastOfTime = new Map<number, number>();
  for (const { time, is } of ranked) {
    if (time !== undefined) {
      if ((lastOfTime.get(time) ?? -1) > is) {
        return false;
      }
      lastOfTime.set(time, is);
    }
  }
  return ranked.every(
    (head) =>
      head.time !== undefined ||
      ranked.every((other) => other.was < head.was === other.is < head.is),
  );
}

function keepsTiedOldTips({
  older,
  oldHeads,
  oldTimes,
  newer,
  tips,
}: Extension): boolean {
  const ranks = ranksOf(tips);
  return keepsTiedOrder(
    [...oldHeads].filter((head) => !isBuiltOn(newer, head)),
    (head) => oldTimes.get(head),
    (head) => older.indexOf(head),
    (head) => ranks.get(head),
  );
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

export interface Region extends Extension {
  readonly region: Commits;
  readonly since: number;
  readonly belowTimes: ReadonlyMap<string, number>;
}

export function regionHistory({
  older,
  oldHeads,
  oldTimes,
  newer,
  tips,
  region,
  since,
  belowTimes,
}: Region): Commits | undefined {
  const { times } = region;
  if (
    !times ||
    !keepsHistory({ older, oldHeads, newer, tips }) ||
    !tipsBuiltOnUntied({ oldHeads, oldTimes, newer }) ||
    !keepsTiedOldTips({ older, oldHeads, oldTimes, newer, tips })
  ) {
    return undefined;
  }
  if (!allIn(newer, region)) {
    return undefined;
  }
  const dropped = countIn(region, older);
  if (
    !oldOnesTopOf(older, region, dropped) ||
    !belowOlderAndUntied(region, since, belowTimes) ||
    !inOneLineByTime(region, times)
  ) {
    return undefined;
  }
  return Commits.replacingTop(region, older, dropped);
}

function noneIn(commits: Commits, list: Commits): boolean {
  for (let at = 0; at < commits.length; at++) {
    if (list.has(commits.hashAt(at))) {
      return false;
    }
  }
  return true;
}

function allIn(commits: Commits, list: Commits): boolean {
  for (let at = 0; at < commits.length; at++) {
    if (!list.has(commits.hashAt(at))) {
      return false;
    }
  }
  return true;
}

function countIn(commits: Commits, list: Commits): number {
  let count = 0;
  for (let at = 0; at < commits.length; at++) {
    if (list.has(commits.hashAt(at))) {
      count++;
    }
  }
  return count;
}

function oldOnesTopOf(
  older: Commits,
  region: Commits,
  dropped: number,
): boolean {
  for (let at = 0; at < region.length; at++) {
    const old = older.indexOf(region.hashAt(at)) ?? older.length;
    if (old < older.length && old >= dropped) {
      return false;
    }
  }
  return true;
}

function belowOlderAndUntied(
  region: Commits,
  since: number,
  belowTimes: ReadonlyMap<string, number>,
): boolean {
  const below = new Set<number>();
  for (let at = region.length; at < region.size; at++) {
    const time = belowTimes.get(region.hashAt(at));
    if (time === undefined || time >= since || below.has(time)) {
      return false;
    }
    below.add(time);
  }
  return true;
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
    const listedBelowAncestor = at > ancestor;
    if (listedBelowAncestor || at >= length || seen[at] === search) {
      continue;
    }
    seen[at] = search;
    for (let parent = starts[at]; parent < starts[at + 1]; parent++) {
      stack.push(parents[parent]);
    }
  }
  return false;
}
