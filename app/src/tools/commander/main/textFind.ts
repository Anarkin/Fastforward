import type { TextEncoding } from '../shared/protocol';
import { codingOf, type ReadBytes } from './textRows';
import {
  maxMatches,
  matchesIn,
  type FindRange,
} from '../../../lib/shared/textMatches';

const defaultChunk = 1024 * 1024;
const widestCharacter = 4;

function continuationRange(lead: number): readonly [number, number] {
  return lead === 0xe0
    ? [0xa0, 0xbf]
    : lead === 0xed
      ? [0x80, 0x9f]
      : lead === 0xf0
        ? [0x90, 0xbf]
        : lead === 0xf4
          ? [0x80, 0x8f]
          : [0x80, 0xbf];
}

function sequenceLength(bytes: Uint8Array, at: number): number {
  const lead = bytes[at] ?? 0;
  const length =
    lead < 0x80
      ? 1
      : lead >= 0xc2 && lead <= 0xdf
        ? 2
        : lead >= 0xe0 && lead <= 0xef
          ? 3
          : lead >= 0xf0 && lead <= 0xf4
            ? 4
            : 1;
  const [low, high] = continuationRange(lead);
  for (let next = 1; next < length; next++) {
    const byte = bytes[at + next];
    const [from, to] = next === 1 ? [low, high] : [0x80, 0xbf];
    if (byte === undefined || byte < from || byte > to) {
      return next;
    }
  }
  return length;
}

const byteOrderMark = 0xfe_ff;

const utf8Mark = [0xef, 0xbb, 0xbf];

function utf8Offsets(
  text: string,
  bytes: Uint8Array,
): (index: number) => number {
  const marked =
    text.codePointAt(0) !== byteOrderMark &&
    utf8Mark.every((byte, index) => bytes[index] === byte);
  const skipped = marked ? utf8Mark.length : 0;
  let lastIndex = 0;
  let lastByte = skipped;
  return (index) => {
    if (index < lastIndex) {
      lastIndex = 0;
      lastByte = skipped;
    }
    while (lastIndex < index) {
      lastByte += sequenceLength(bytes, lastByte);
      lastIndex += (text.codePointAt(lastIndex) ?? 0) > 0xffff ? 2 : 1;
    }
    return lastByte - skipped;
  };
}

const utf16Marks = {
  'utf-16le': [0xff, 0xfe],
  'utf-16be': [0xfe, 0xff],
} as const;

function byteOffsets(
  text: string,
  bytes: Uint8Array,
  encoding: TextEncoding,
): (index: number) => number {
  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    const skipped =
      text.codePointAt(0) !== byteOrderMark &&
      utf16Marks[encoding].every((byte, index) => bytes[index] === byte)
        ? 2
        : 0;
    return (index) => skipped + index * 2;
  }
  if (encoding !== 'utf-8') {
    return (index) => index;
  }
  return utf8Offsets(text, bytes);
}

export async function findInFile(
  read: ReadBytes,
  size: number,
  query: string,
  encoding: TextEncoding,
  {
    chunk = defaultChunk,
    limit = maxMatches,
    signal,
    onChunk,
  }: {
    readonly chunk?: number;
    readonly limit?: number;
    readonly signal?: AbortSignal;
    readonly onChunk?: (matches: readonly FindRange[]) => void;
  } = {},
): Promise<
  { readonly matches: FindRange[]; readonly capped: boolean } | undefined
> {
  const matches: FindRange[] = [];
  if (query === '') {
    return { matches, capped: false };
  }
  const coding = codingOf(encoding);
  const overlap = query.length * widestCharacter + widestCharacter;
  let position = 0;
  while (position < size && matches.length < limit) {
    const asked = chunk + overlap;
    const bytes = await read(position, asked);
    if (signal?.aborted) {
      return undefined;
    }
    const ended = bytes.length < asked;
    const last = ended || position + bytes.length >= size;
    const end = last
      ? bytes.length
      : coding.boundaryBefore(bytes, bytes.length);
    const core =
      last || position + chunk >= size
        ? end
        : Math.max(
            coding.unit,
            coding.boundaryBefore(bytes, Math.min(chunk, end)),
          );
    const decoded = bytes.subarray(0, end);
    const text = coding.decode(decoded);
    const offset = byteOffsets(text, decoded, encoding);
    for (const range of matchesIn(text, query)) {
      const start = offset(range.start);
      if (start >= core || matches.length >= limit) {
        break;
      }
      matches.push({
        start: position + start,
        end: position + offset(range.end),
      });
    }
    position += core;
    onChunk?.(matches);
    if (signal?.aborted) {
      return undefined;
    }
    if (ended) {
      break;
    }
  }
  return { matches, capped: matches.length >= limit };
}
