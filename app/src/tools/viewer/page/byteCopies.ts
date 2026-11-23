import { maxMatches } from '../../../lib/shared/textMatches';
import type { ByteRange } from '../shared/protocol';

const pair = /^(?:[0-9a-f]{2})+$/i;

const hexBase = 16;

const pairLength = 2;

export function hexBytes(digits: string): number[] {
  return pair.test(digits)
    ? Array.from({ length: digits.length / pairLength }, (_, at) =>
        Number.parseInt(
          digits.slice(at * pairLength, at * pairLength + pairLength),
          hexBase,
        ),
      )
    : [];
}

export function bytesFound(
  start: number,
  data: readonly number[],
  sought: readonly number[],
): ByteRange[] {
  const found: ByteRange[] = [];
  const [first] = sought;
  if (first === undefined) {
    return found;
  }
  for (
    let at = data.indexOf(first);
    at !== -1 && at + sought.length <= data.length && found.length < maxMatches;
    at = data.indexOf(first, at + 1)
  ) {
    if (sought.every((byte, index) => data[at + index] === byte)) {
      found.push({ start: start + at, end: start + at + sought.length });
    }
  }
  return found;
}
