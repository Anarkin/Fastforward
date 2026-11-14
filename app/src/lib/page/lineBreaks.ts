export type LineBreaker = (text: string) => Iterable<number>;

export type Box = readonly [start: number, end: number];

const tableSize = 128;
const asciiBreaks = new Uint8Array(tableSize * tableSize);

function breaksBetweenAscii(befores: string, afters: string): void {
  for (const before of befores) {
    for (const after of afters) {
      asciiBreaks[before.charCodeAt(0) * tableSize + after.charCodeAt(0)] = 1;
    }
  }
}

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const digits = '0123456789';
breaksBetweenAscii('!"#%&)*+,.:;=>\\]|}~', '(<[{');
breaksBetweenAscii('-', `"#%&'(*+-<=>@[\\^_\`{|~${letters}`);
breaksBetweenAscii('?', `#$%&(*+-<=>@[\\^_\`{|~${digits}${letters}`);

const hyphen = 0x2d;
const ideographicSpace = 0x3000;
const objectReplacement = '￼';

const space = 0x20;
const tab = 0x09;

const isSpace = (code: number) => code === space || code === tab;

const isDigit = (code: number) => code >= 0x30 && code <= 0x39;

const isLetterOrDigit = (code: number) =>
  isDigit(code) || ((code | 0x20) >= 0x61 && (code | 0x20) <= 0x7a);

export function asciiBreakAt(text: string, at: number): boolean {
  const before = text.charCodeAt(at - 1);
  const after = text.charCodeAt(at);
  if (before === hyphen && isDigit(after)) {
    return isLetterOrDigit(text.charCodeAt(at - 2));
  }
  return (
    before < tableSize &&
    after < tableSize &&
    asciiBreaks[before * tableSize + after] === 1
  );
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const wideBreaking =
  /[\p{Ideographic}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}￼]/u;

const keptBeforeNext = /[（「『【〔〈《［｛〘〖]$/u;

const keptAfterPrevious = /^[）」』】〕〉》］｝〙〗。、，．！？：；]/u;

export function approximateBreaks(text: string): number[] {
  const breaks: number[] = [];
  let before: string | undefined;
  for (const { segment, index } of graphemes.segment(text)) {
    if (
      before !== undefined &&
      (wideBreaking.test(before) || wideBreaking.test(segment)) &&
      !keptBeforeNext.test(before) &&
      !keptAfterPrevious.test(segment)
    ) {
      breaks.push(index);
    }
    before = segment;
  }
  return breaks;
}

interface BreakIterator {
  adoptText(text: string): void;
  first(): number;
  next(): number;
}

type BoundaryKind = 'character' | 'line';

type BreakIteratorClass = new (
  locale: undefined,
  options: { readonly type: BoundaryKind },
) => BreakIterator;

function isBreakIteratorClass(value: unknown): value is BreakIteratorClass {
  return typeof value === 'function';
}

const icuIterators = new Map<BoundaryKind, BreakIterator | false>();

function icuBoundaries(kind: BoundaryKind, text: string): number[] | undefined {
  let iterator = icuIterators.get(kind);
  if (iterator === undefined) {
    const found: unknown = Reflect.get(Intl, 'v8BreakIterator');
    iterator = isBreakIteratorClass(found)
      ? new found(undefined, { type: kind })
      : false;
    icuIterators.set(kind, iterator);
  }
  if (iterator === false) {
    return undefined;
  }
  iterator.adoptText(text);
  const boundaries: number[] = [];
  for (let at = iterator.first(); at !== -1; at = iterator.next()) {
    boundaries.push(at);
  }
  return boundaries;
}

export function clusterBoundaries(text: string): number[] {
  return (
    icuBoundaries('character', text) ?? [
      ...Array.from(graphemes.segment(text), ({ index }) => index),
      text.length,
    ]
  );
}

const browserBreaks: LineBreaker = (text) =>
  icuBoundaries('line', text) ?? approximateBreaks(text);

function breakerInput(
  text: string,
  boxes: readonly Box[],
): { readonly input: string; readonly origins: readonly number[] | undefined } {
  const spaced = text.includes('\t') ? text.replaceAll('\t', ' ') : text;
  if (boxes.length === 0) {
    return { input: spaced, origins: undefined };
  }
  const origins: number[] = [];
  let input = '';
  let at = 0;
  const keep = (end: number) => {
    input += spaced.slice(at, end);
    for (; at < end; at++) {
      origins.push(at);
    }
  };
  for (const [start, end] of boxes) {
    keep(start);
    input += objectReplacement;
    origins.push(start);
    at = end;
  }
  keep(text.length);
  origins.push(text.length);
  return { input, origins };
}

export function lineBreaks(
  text: string,
  boxes: readonly Box[] = [],
  breaker: LineBreaker = browserBreaks,
): Uint8Array {
  const flags = new Uint8Array(text.length + 1);
  const { input, origins } = breakerInput(text, boxes);
  for (const found of breaker(input)) {
    const at = origins === undefined ? found : origins[found];
    if (
      at > 0 &&
      at < text.length &&
      (text.charCodeAt(at - 1) >= tableSize || text.charCodeAt(at) >= tableSize)
    ) {
      flags[at] = 1;
    }
  }
  for (let at = 1; at < text.length; at++) {
    if (isSpace(text.charCodeAt(at))) {
      flags[at] = 0;
    } else if (isSpace(text.charCodeAt(at - 1)) || asciiBreakAt(text, at)) {
      flags[at] = 1;
    }
  }
  if (text.includes(String.fromCharCode(ideographicSpace))) {
    hangIdeographicSpaces(text, boxes, flags);
  }
  return flags;
}

function hangIdeographicSpaces(
  text: string,
  boxes: readonly Box[],
  flags: Uint8Array,
): void {
  const boxStarts = new Set(boxes.map(([start]) => start));
  const hangsAt = (at: number) =>
    text.charCodeAt(at) === ideographicSpace && !boxStarts.has(at);
  for (let at = 1; at < text.length; at++) {
    if (flags[at] === 1 && hangsAt(at)) {
      flags[at] = 0;
      let after = at;
      while (hangsAt(after)) {
        after++;
      }
      if (after < text.length) {
        flags[after] = 1;
      }
      at = after;
    }
  }
}
