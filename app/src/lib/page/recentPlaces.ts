const mostRecentPlaces = 200;

export function withRecent<T>(
  places: ReadonlyMap<string, T>,
  key: string,
  place: T | undefined,
  most = mostRecentPlaces,
): ReadonlyMap<string, T> {
  if (place === undefined && !places.has(key)) {
    return places;
  }
  if (place !== undefined && places.get(key) === place) {
    return places;
  }
  const next = new Map(places);
  next.delete(key);
  if (place !== undefined) {
    next.set(key, place);
  }
  for (const oldest of next.keys()) {
    if (next.size <= most) {
      break;
    }
    next.delete(oldest);
  }
  return next;
}

export function withoutWhere<T>(
  places: ReadonlyMap<string, T>,
  drops: (key: string) => boolean,
): ReadonlyMap<string, T> {
  const kept = [...places].filter(([key]) => !drops(key));
  return kept.length === places.size ? places : new Map(kept);
}
