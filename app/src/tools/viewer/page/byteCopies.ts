import { maxMatches, longestCopy } from '../../../lib/shared/textMatches';
import type { ByteRange } from '../shared/protocol';
import {
  ordered,
  type TextSelection,
} from '../../../components/cells/page/cellView';

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

export function selectedBytes(
  selection: TextSelection,
  { start, data }: { readonly start: number; readonly data: readonly number[] },
): number[] {
  const { first, last } = ordered(selection);
  const from = first.start + first.char - start;
  const to = last.start + last.char - start;
  return from < 0 || to > data.length || to - from > longestCopy
    ? []
    : data.slice(from, to);
}
