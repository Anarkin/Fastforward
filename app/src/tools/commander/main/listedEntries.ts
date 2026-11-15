import type { Entry } from '../shared/protocol';
import type { Pane } from './sides';

const entriesByName = new WeakMap<
  readonly Entry[],
  ReadonlyMap<string, Entry>
>();

export function entryNamed(
  entries: readonly Entry[] | undefined,
  name: unknown,
): Entry | undefined {
  if (entries === undefined || typeof name !== 'string') {
    return undefined;
  }
  let named = entriesByName.get(entries);
  if (named === undefined) {
    const built = new Map<string, Entry>();
    for (const entry of entries) {
      if (!built.has(entry.name)) {
        built.set(entry.name, entry);
      }
    }
    named = built;
    entriesByName.set(entries, named);
  }
  return named.get(name);
}

export function listedIn(
  pane: Pane | undefined,
  name: unknown,
): Entry | undefined {
  if (pane?.flat === undefined) {
    return entryNamed(pane?.entries, name);
  }
  return typeof name === 'string' ? pane.flat.tree.file(name) : undefined;
}
