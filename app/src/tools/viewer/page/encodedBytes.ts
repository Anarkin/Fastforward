import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

function utf8Bytes(text: string, from: number, to: number): number {
  let bytes = 0;
  for (let at = from; at < to; at++) {
    const code = text.charCodeAt(at);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (isHigh(code) && at + 1 < to && isLow(text.charCodeAt(at + 1))) {
      bytes += 4;
      at++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

export function bytesOf(
  text: string,
  from: number,
  to: number,
  encoding: TextEncoding,
): number {
  switch (encoding) {
    case 'utf-8':
      return utf8Bytes(text, from, to);
    case 'utf-16le':
    case 'utf-16be':
      return (to - from) * 2;
    default:
      return to - from;
  }
}
