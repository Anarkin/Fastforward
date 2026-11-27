type Node =
  | { readonly kind: 'char'; readonly test: (character: string) => boolean }
  | { readonly kind: 'star'; readonly slash: boolean }
  | { readonly kind: 'number'; readonly low: number; readonly high: number }
  | { readonly kind: 'seq'; readonly items: readonly Node[] }
  | { readonly kind: 'alt'; readonly options: readonly Node[] };

type State =
  | { readonly kind: 'end' }
  | {
      readonly kind: 'char';
      readonly test: (character: string) => boolean;
      readonly next: number;
    }
  | { readonly kind: 'split'; readonly to: number[] }
  | {
      readonly kind: 'number';
      readonly low: number;
      readonly high: number;
      readonly next: number;
    };

interface Matcher {
  readonly states: readonly State[];
  readonly start: number;
}

const mostDigits = 15;

const mostGlobs = 500;

const numberRange = /^(-?\d{1,15})\.\.(-?\d{1,15})$/;

const literal = (character: string): Node => ({
  kind: 'char',
  test: (each) => each === character,
});

const notSlash = (character: string): boolean => character !== '/';

function classEnd(chars: readonly string[], from: number, to: number) {
  for (let at = from; at < to; at++) {
    if (chars[at] === '\\') {
      at++;
    } else if (chars[at] === ']' && at > from) {
      return at;
    }
  }
  return -1;
}

function classOf(inside: readonly string[]): (character: string) => boolean {
  const negated = inside[0] === '!';
  const items = negated ? inside.slice(1) : inside;
  const ranges: (readonly [string, string])[] = [];
  for (let at = 0; at < items.length; at++) {
    if (items[at] === '\\' && at + 1 < items.length) {
      at++;
    }
    const low = items[at] ?? '';
    if (items[at + 1] === '-' && at + 2 < items.length) {
      ranges.push([low, items[at + 2] ?? low]);
      at += 2;
    } else {
      ranges.push([low, low]);
    }
  }
  const within = (character: string) =>
    ranges.some(([low, high]) => character >= low && character <= high);
  return negated
    ? (character) => notSlash(character) && !within(character)
    : within;
}

function braceEnd(chars: readonly string[], from: number, to: number) {
  let depth = 0;
  for (let at = from; at < to; at++) {
    if (chars[at] === '\\') {
      at++;
    } else if (chars[at] === '{') {
      depth++;
    } else if (chars[at] === '}') {
      depth--;
      if (depth === 0) {
        return at;
      }
    }
  }
  return -1;
}

function parts(chars: readonly string[], from: number, to: number) {
  const found: (readonly [number, number])[] = [];
  let depth = 0;
  let start = from;
  for (let at = from; at < to; at++) {
    if (chars[at] === '\\') {
      at++;
    } else if (chars[at] === '{') {
      depth++;
    } else if (chars[at] === '}') {
      depth--;
    } else if (chars[at] === ',' && depth === 0) {
      found.push([start, at]);
      start = at + 1;
    }
  }
  found.push([start, to]);
  return found;
}

function braced(chars: readonly string[], from: number, to: number): Node {
  const range = numberRange.exec(chars.slice(from, to).join(''));
  if (range !== null) {
    const [one, other] = [Number(range[1]), Number(range[2])];
    return {
      kind: 'number',
      low: Math.min(one, other),
      high: Math.max(one, other),
    };
  }
  return {
    kind: 'alt',
    options: parts(chars, from, to).map(([start, end]) =>
      parsed(chars, start, end),
    ),
  };
}

function parsed(chars: readonly string[], from: number, to: number): Node {
  const items: Node[] = [];
  for (let at = from; at < to; at++) {
    const character = chars[at] ?? '';
    if (character === '\\' && at + 1 < to) {
      at++;
      items.push(literal(chars[at] ?? ''));
    } else if (character === '*') {
      const both = at + 1 < to && chars[at + 1] === '*';
      items.push({ kind: 'star', slash: both });
      at += both ? 1 : 0;
    } else if (character === '?') {
      items.push({ kind: 'char', test: notSlash });
    } else if (character === '[' && classEnd(chars, at + 1, to) !== -1) {
      const end = classEnd(chars, at + 1, to);
      items.push({ kind: 'char', test: classOf(chars.slice(at + 1, end)) });
      at = end;
    } else if (character === '{' && braceEnd(chars, at, to) > at + 1) {
      const end = braceEnd(chars, at, to);
      items.push(braced(chars, at + 1, end));
      at = end;
    } else {
      items.push(literal(character));
    }
  }
  return { kind: 'seq', items };
}

function compiled(node: Node, next: number, states: State[]): number {
  switch (node.kind) {
    case 'char':
      states.push({ kind: 'char', test: node.test, next });
      return states.length - 1;
    case 'number':
      states.push({ kind: 'number', low: node.low, high: node.high, next });
      return states.length - 1;
    case 'seq':
      return node.items.reduceRight(
        (after, item) => compiled(item, after, states),
        next,
      );
    case 'alt': {
      const to = node.options.map((option) => compiled(option, next, states));
      states.push({ kind: 'split', to });
      return states.length - 1;
    }
    case 'star': {
      const loop = states.length;
      states.push({ kind: 'split', to: [loop + 1, next] });
      states.push({
        kind: 'char',
        test: node.slash ? () => true : notSlash,
        next: loop,
      });
      return loop;
    }
    default:
      return node satisfies never;
  }
}

function numberEnds(
  chars: readonly string[],
  at: number,
  low: number,
  high: number,
): number[] {
  const signed = chars[at] === '-' ? 1 : 0;
  const ends: number[] = [];
  let digits = '';
  for (
    let end = at + signed;
    end < chars.length && end - at - signed < mostDigits;
    end++
  ) {
    const character = chars[end] ?? '';
    if (character < '0' || character > '9') {
      break;
    }
    digits += character;
    const value = Number(digits) * (signed === 1 ? -1 : 1);
    const canonical = digits === '0' ? signed === 0 : !digits.startsWith('0');
    if (canonical && value >= low && value <= high) {
      ends.push(end + 1);
    }
  }
  return ends;
}

function matcherOf(glob: string): Matcher {
  const anchored = glob.startsWith('/');
  const chars = Array.from(anchored ? glob.slice(1) : glob);
  const body = parsed(chars, 0, chars.length);
  const node: Node = chars.includes('/')
    ? body
    : {
        kind: 'seq',
        items: [
          {
            kind: 'alt',
            options: [
              { kind: 'seq', items: [] },
              {
                kind: 'seq',
                items: [{ kind: 'star', slash: true }, literal('/')],
              },
            ],
          },
          body,
        ],
      };
  const states: State[] = [{ kind: 'end' }];
  return { states, start: compiled(node, 0, states) };
}

function matched({ states, start }: Matcher, text: string): boolean {
  const chars = Array.from(text);
  const waiting = new Map<number, Set<number>>([[0, new Set([start])]]);
  const add = (at: number, state: number) => {
    const set = waiting.get(at) ?? new Set<number>();
    waiting.set(at, set.add(state));
  };
  for (let at = 0; at <= chars.length; at++) {
    const here = waiting.get(at);
    waiting.delete(at);
    const stack = [...(here ?? [])];
    const seen = new Set<number>();
    for (let index = stack.pop(); index !== undefined; index = stack.pop()) {
      const state = states[index];
      if (seen.has(index) || state === undefined) {
        continue;
      }
      seen.add(index);
      switch (state.kind) {
        case 'end':
          if (at === chars.length) {
            return true;
          }
          break;
        case 'split':
          stack.push(...state.to);
          break;
        case 'char':
          if (at < chars.length && state.test(chars[at] ?? '')) {
            add(at + 1, state.next);
          }
          break;
        case 'number':
          for (const end of numberEnds(chars, at, state.low, state.high)) {
            add(end, state.next);
          }
          break;
        default:
          state satisfies never;
      }
    }
  }
  return false;
}

const kept = new Map<string, Matcher>();

export function globMatches(glob: string, file: string): boolean {
  let matcher = kept.get(glob);
  if (matcher === undefined) {
    if (kept.size >= mostGlobs) {
      kept.clear();
    }
    matcher = matcherOf(glob);
    kept.set(glob, matcher);
  }
  return matched(matcher, file);
}
