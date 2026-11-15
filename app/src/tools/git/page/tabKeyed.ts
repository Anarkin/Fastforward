export function withKey(
  keys: ReadonlySet<string>,
  key: string | undefined,
  kept: boolean,
): ReadonlySet<string> {
  if (key === undefined || keys.has(key) === kept) {
    return keys;
  }
  const next = new Set(keys);
  if (kept) {
    next.add(key);
  } else {
    next.delete(key);
  }
  return next;
}

export function withEntry<T>(
  entries: ReadonlyMap<string, T>,
  key: string | undefined,
  value: T | undefined,
): ReadonlyMap<string, T> {
  if (key === undefined || entries.get(key) === value) {
    return entries;
  }
  const next = new Map(entries);
  if (value === undefined) {
    next.delete(key);
  } else {
    next.set(key, value);
  }
  return next;
}
