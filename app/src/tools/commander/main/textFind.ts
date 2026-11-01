import type { TextEncoding } from '../shared/protocol';
import { codingOf, type ReadBytes } from './textRows';
import {
  maxMatches,
  matchesIn,
  type FindRange,
} from '../../../shared/textMatches';

const defaultChunk = 1024 * 1024;
const widestCharacter = 4;

function byteOffsets(
  text: string,
  encoding: TextEncoding,
): (index: number) => number {
  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    return (index) => index * 2;
  }
  if (encoding !== 'utf-8') {
    return (index) => index;
  }
  let lastIndex = 0;
  let lastByte = 0;
  return (index) => {
    if (index < lastIndex) {
      lastIndex = 0;
      lastByte = 0;
    }
    lastByte += Buffer.byteLength(text.slice(lastIndex, index), 'utf8');
    lastIndex = index;
    return lastByte;
  };
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
    const bytes = await read(position, chunk + overlap);
    if (signal?.aborted) {
      return undefined;
    }
    const last = position + bytes.length >= size;
    const end = last
      ? bytes.length
      : coding.boundaryBefore(bytes, bytes.length);
    const core =
      position + chunk >= size
        ? end
        : Math.max(
            coding.unit,
            coding.boundaryBefore(bytes, Math.min(chunk, end)),
          );
    const text = coding.decode(bytes.subarray(0, end));
    const offset = byteOffsets(text, encoding);
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
  }
  return { matches, capped: matches.length >= limit };
}
