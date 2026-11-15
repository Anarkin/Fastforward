import { maxInputLength } from '../shared/protocol';

export function inputChunks(
  data: string,
  length: number = maxInputLength,
): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < data.length) {
    let end = Math.min(start + length, data.length);
    if (
      end < data.length &&
      end - 1 > start &&
      isHighSurrogate(data.charCodeAt(end - 1))
    ) {
      end -= 1;
    }
    chunks.push(data.slice(start, end));
    start = end;
  }
  return chunks;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
