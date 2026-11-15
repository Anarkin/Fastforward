import { isObject, type Json } from '../../lib/main/json';

export function valueAt(json: unknown, keys: readonly string[]): unknown {
  return keys.reduce<unknown>(
    (value, key) => (isObject(value) ? value[key] : undefined),
    json,
  );
}

export function withValue(
  json: Json,
  keys: readonly string[],
  value: unknown,
): Json {
  const [key, ...rest] = keys;
  if (key === undefined) {
    return json;
  }
  const result = { ...json };
  const inner =
    rest.length === 0
      ? value
      : withValue(isObject(json[key]) ? json[key] : {}, rest, value);
  if (
    inner === undefined ||
    (isObject(inner) && Object.keys(inner).length === 0)
  ) {
    delete result[key];
  } else {
    result[key] = inner;
  }
  return result;
}

export function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function overridesOf(defaults: object, settings: object): Json {
  const fallback: Json = { ...defaults };
  const overrides: Json = {};
  for (const [key, value] of Object.entries(settings)) {
    const base = fallback[key];
    if (isObject(base) && isObject(value)) {
      const nested = overridesOf(base, value);
      if (Object.keys(nested).length > 0) {
        overrides[key] = nested;
      }
    } else if (!same(base, value)) {
      overrides[key] = value;
    }
  }
  return overrides;
}
