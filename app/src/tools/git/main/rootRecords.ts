import { isObject } from '../../../lib/main/json';
import { sameRoot } from '../../../lib/main/paths';
import type { Store } from '../../../shell/main/stateFile';

export function keyOf(roots: Record<string, unknown>, root: string): string {
  return Object.keys(roots).find((key) => sameRoot(key, root)) ?? root;
}

export function keyIn(
  roots: ReadonlyMap<string, unknown>,
  root: string,
): string {
  return [...roots.keys()].find((key) => sameRoot(key, root)) ?? root;
}

export function recordOf(value: unknown): Record<string, unknown> {
  return isObject(value) ? { ...value } : {};
}

export async function withoutRoots(
  state: Store,
  key: string,
  roots: readonly string[],
): Promise<void> {
  const all = recordOf(state.get(key));
  const kept = Object.entries(all).filter(
    ([root]) => !roots.some((forgotten) => sameRoot(root, forgotten)),
  );
  if (kept.length < Object.keys(all).length) {
    await state.update(key, Object.fromEntries(kept));
  }
}
