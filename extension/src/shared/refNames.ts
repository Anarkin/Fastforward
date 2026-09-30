import type { Bookmark, BookmarkRef } from './protocol';

export function withoutRemote(name: string): string {
  return name.slice(name.indexOf('/') + 1);
}

export function refOf(ref: BookmarkRef): BookmarkRef {
  return { kind: ref.kind, name: ref.name };
}

export function sameRef(a: Bookmark, b: Bookmark): boolean {
  return a.kind === b.kind && a.name === b.name;
}

export function findRef<T extends Bookmark>(
  refs: readonly T[],
  ref: Bookmark,
): T | undefined {
  return refs.find((other) => sameRef(other, ref));
}

export function hasRef(refs: readonly Bookmark[], ref: Bookmark): boolean {
  return findRef(refs, ref) !== undefined;
}
