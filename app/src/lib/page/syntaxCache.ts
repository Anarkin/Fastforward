import type { StateStack } from 'shiki/textmate';
import type { LineRanges } from './syntaxEngine';

export interface Colors {
  readonly ranges: LineRanges;
  readonly states?: readonly StateStack[];
}

const maxCachedLines = 100_000;
const maxCachedChars = 8_000_000;
const cache = new Map<string, Colors>();
const cachedByFirstLine = new Map<string, Set<string>>();
let cachedLines = 0;
let cachedChars = 0;

export function cached(key: string): Colors | undefined {
  const colors = cache.get(key);
  if (colors) {
    cache.delete(key);
    cache.set(key, colors);
  }
  return colors;
}

function textStart(key: string): number {
  return key.indexOf('\n') + 1;
}

function textLength(key: string): number {
  return key.length - textStart(key);
}

function firstLineOf(key: string): string {
  const end = key.indexOf('\n', textStart(key));
  return end === -1 ? key : key.slice(0, end);
}

export function cacheable(key: string, lines: number): boolean {
  return textLength(key) <= maxCachedChars / 4 && lines <= maxCachedLines;
}

export function store(key: string, colors: Colors) {
  if (!cacheable(key, colors.ranges.length) || cache.has(key)) {
    return;
  }
  cache.set(key, colors);
  const firstLine = firstLineOf(key);
  const alike = cachedByFirstLine.get(firstLine) ?? new Set();
  cachedByFirstLine.set(firstLine, alike.add(key));
  cachedLines += colors.ranges.length;
  cachedChars += textLength(key);
  for (const [oldest, colored] of cache) {
    if (cachedLines <= maxCachedLines && cachedChars <= maxCachedChars) {
      break;
    }
    uncache(oldest, colored);
  }
}

function uncache(key: string, { ranges }: Colors) {
  cache.delete(key);
  const firstLine = firstLineOf(key);
  const alike = cachedByFirstLine.get(firstLine);
  alike?.delete(key);
  if (alike?.size === 0) {
    cachedByFirstLine.delete(firstLine);
  }
  cachedLines -= ranges.length;
  cachedChars -= textLength(key);
}

function languageOfKey(key: string): string {
  return key.slice(0, textStart(key) - 1);
}

export function forgetCached(languages: ReadonlySet<string>) {
  for (const [key, colors] of cache) {
    if (languages.has(languageOfKey(key))) {
      uncache(key, colors);
    }
  }
}

function linesInCommon(key: string, other: string): number {
  const from = textStart(key);
  let low = from;
  let high = Math.min(key.length, other.length);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (key.slice(from, middle) === other.slice(from, middle)) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  let lines = 0;
  for (
    let end = key.indexOf('\n', from);
    end !== -1 && end < low;
    end = key.indexOf('\n', end + 1)
  ) {
    lines += 1;
  }
  const endsLine = (text: string) => low === text.length || text[low] === '\n';
  return endsLine(key) && endsLine(other) ? lines + 1 : lines;
}

export interface CachedPrefix {
  readonly ranges: LineRanges;
  readonly states: readonly StateStack[];
  readonly lines: number;
}

export function cachedPrefix(key: string): CachedPrefix | undefined {
  let best: CachedPrefix | undefined;
  for (const other of cachedByFirstLine.get(firstLineOf(key)) ?? []) {
    const colors = cache.get(other);
    const lines = linesInCommon(key, other);
    if (colors?.states && lines > (best?.lines ?? 0)) {
      best = {
        ranges: colors.ranges,
        states: colors.states,
        lines,
      };
    }
  }
  return best;
}
