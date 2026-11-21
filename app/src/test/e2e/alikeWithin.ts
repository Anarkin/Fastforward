import * as assert from 'node:assert';

function takenWithin(
  actual: unknown,
  expected: unknown,
  tolerance: number,
): unknown {
  if (typeof actual === 'number' && typeof expected === 'number') {
    return Math.abs(actual - expected) <= tolerance ? expected : actual;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return actual.map((each, index) =>
      takenWithin(each, expected[index], tolerance),
    );
  }
  if (
    typeof actual === 'object' &&
    actual !== null &&
    typeof expected === 'object' &&
    expected !== null
  ) {
    return Object.fromEntries(
      Object.entries(actual).map(([key, value]) => [
        key,
        takenWithin(value, Reflect.get(expected, key), tolerance),
      ]),
    );
  }
  return actual;
}

export function alikeWithin<T>(
  actual: T,
  expected: T,
  tolerance: number,
  message?: string,
): void {
  assert.deepStrictEqual(
    takenWithin(actual, expected, tolerance),
    expected,
    message,
  );
}
