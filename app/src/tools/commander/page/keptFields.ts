import type { KeptFocus, KeptTyped } from '../../../lib/page/keptFocus';
import {
  isSearchOptions,
  type Search,
  type SearchOptions,
} from '../../../lib/shared/searchOptions';

export type Fields = (name: string) => unknown;

export function fieldsOf(value: unknown): Fields | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return (name) =>
    Object.hasOwn(value, name) ? Reflect.get(value, name) : undefined;
}

export const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export const countOf = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const flagOf = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

export function oneOf<T extends string>(
  choices: readonly T[],
  value: unknown,
): T | undefined {
  return choices.find((choice) => choice === value);
}

export function listOf<T>(
  value: unknown,
  each: (item: unknown) => T | undefined,
): readonly T[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items: T[] = [];
  for (const item of value) {
    const decoded = each(item);
    if (decoded !== undefined) {
      items.push(decoded);
    }
  }
  return items;
}

export const optionsOf = (value: unknown): SearchOptions | undefined =>
  isSearchOptions(value) ? value : undefined;

export function searchOf(value: unknown): Search | undefined {
  const fields = fieldsOf(value);
  const query = textOf(fields?.('query'));
  const options = optionsOf(fields?.('options'));
  return query === undefined || options === undefined
    ? undefined
    : { query, options };
}

const directions = ['forward', 'backward', 'none'] as const;

export function keptFocusOf(value: unknown): KeptFocus | undefined {
  const fields = fieldsOf(value);
  const name = textOf(fields?.('name'));
  if (name === undefined) {
    return undefined;
  }
  const selection = fields?.('selection');
  if (!Array.isArray(selection) || selection.length !== 3) {
    return { name };
  }
  const start = countOf(selection[0]);
  const end = countOf(selection[1]);
  const direction = oneOf(directions, selection[2]);
  return start === undefined || end === undefined || direction === undefined
    ? { name }
    : { name, selection: [start, end, direction] };
}

export function keptTypedOf(value: unknown): KeptTyped | undefined {
  const fields = fieldsOf(value);
  const typed = textOf(fields?.('value'));
  if (typed === undefined) {
    return undefined;
  }
  const selection = keptFocusOf({
    name: '',
    selection: fields?.('selection'),
  })?.selection;
  return selection === undefined
    ? { value: typed }
    : { value: typed, selection };
}
