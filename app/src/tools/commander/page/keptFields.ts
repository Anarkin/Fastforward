import { caretSchema, type KeptTyped } from '../../../lib/page/keptFocus';
import {
  isSearchOptions,
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

export function keptTypedOf(value: unknown): KeptTyped | undefined {
  const fields = fieldsOf(value);
  const typed = textOf(fields?.('value'));
  if (typed === undefined) {
    return undefined;
  }
  const selection = caretSchema.decode(fields?.('selection'));
  return selection === undefined
    ? { value: typed }
    : { value: typed, selection };
}
