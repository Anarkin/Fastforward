import type { Sentence } from '../shared/sentences';

const places = [
  'below',
  'below-center',
  'below-end',
  'above',
  'above-center',
  'above-end',
  'over',
] as const;

export type TipAt = (typeof places)[number];

export interface TipRow {
  readonly name: string;
  readonly values: string;
}

export interface TipOptions {
  readonly at?: TipAt;
  readonly cut?: boolean;
  readonly keys?: string | undefined;
  readonly note?: string | undefined;
  readonly rows?: readonly TipRow[] | undefined;
}

export interface TipProps {
  readonly 'data-tip'?: string;
  readonly 'data-tip-said'?: string;
  readonly 'data-tip-at'?: TipAt;
  readonly 'data-tip-cut'?: '';
  readonly 'data-tip-keys'?: string;
  readonly 'data-tip-note'?: string;
  readonly 'data-tip-rows'?: string;
}

export interface Tip {
  readonly said: Sentence;
  readonly at: TipAt;
  readonly cut: boolean;
  readonly keys: string | undefined;
  readonly note?: string;
  readonly rows?: readonly TipRow[];
}

export const tipped = '[data-tip]';

const wordsOf = (said: Sentence): string =>
  typeof said === 'string'
    ? said
    : said
        .map((part) => (typeof part === 'string' ? part : part.name))
        .join('');

const centered = 'button';

export function tip(
  said: Sentence | false | undefined,
  { at, cut = false, keys, note, rows }: TipOptions = {},
): TipProps {
  if (said === undefined || said === false || wordsOf(said) === '') {
    return {};
  }
  return {
    'data-tip': wordsOf(said),
    ...(typeof said !== 'string' && { 'data-tip-said': JSON.stringify(said) }),
    ...(at !== undefined && { 'data-tip-at': at }),
    ...(cut && { 'data-tip-cut': '' as const }),
    ...(keys !== undefined && { 'data-tip-keys': keys }),
    ...(note !== undefined && note !== '' && { 'data-tip-note': note }),
    ...(rows !== undefined &&
      rows.length > 0 && { 'data-tip-rows': JSON.stringify(rows) }),
  };
}

export function labelTip(
  label: string | undefined,
  options: TipOptions = {},
): TipProps & { readonly 'aria-label'?: string } {
  return label === undefined || label === ''
    ? {}
    : { 'aria-label': label, ...tip(label, options) };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPart = (part: unknown): boolean =>
  typeof part === 'string' ||
  (isRecord(part) &&
    typeof part.name === 'string' &&
    (part.path === undefined ||
      part.path === 'file' ||
      part.path === 'folder') &&
    (part.root === undefined || typeof part.root === 'string'));

function isSentence(value: unknown): value is Sentence {
  return Array.isArray(value) && value.every(isPart);
}

function saidOf(plain: string, told: string | null): Sentence {
  if (told === null) {
    return plain;
  }
  try {
    const read: unknown = JSON.parse(told);
    return isSentence(read) ? read : plain;
  } catch {
    return plain;
  }
}

const isRow = (row: unknown): row is TipRow =>
  isRecord(row) &&
  typeof row.name === 'string' &&
  typeof row.values === 'string';

function rowsOf(told: string | null): readonly TipRow[] | undefined {
  if (told === null) {
    return undefined;
  }
  try {
    const read: unknown = JSON.parse(told);
    return Array.isArray(read) && read.length > 0 && read.every(isRow)
      ? read
      : undefined;
  } catch {
    return undefined;
  }
}

const isPlace = (at: string | null): at is TipAt =>
  places.some((place) => place === at);

export function tipOf(element: Element): Tip | undefined {
  const plain = element.getAttribute('data-tip');
  if (plain === null || plain === '') {
    return undefined;
  }
  const at = element.getAttribute('data-tip-at');
  const note = element.getAttribute('data-tip-note');
  const rows = rowsOf(element.getAttribute('data-tip-rows'));
  return {
    said: saidOf(plain, element.getAttribute('data-tip-said')),
    at: isPlace(at) ? at : element.matches(centered) ? 'below-center' : 'below',
    cut: element.hasAttribute('data-tip-cut'),
    keys: element.getAttribute('data-tip-keys') ?? undefined,
    ...(note !== null && note !== '' && { note }),
    ...(rows !== undefined && { rows }),
  };
}
