import { strings } from '../../../lib/shared/strings';

const firstPrintable = 0x20;
const lastPrintable = 0x7e;

export const isPrintable = (byte: number): boolean =>
  byte >= firstPrintable && byte <= lastPrintable;

export function byteText(bytes: Iterable<number>): string {
  let text = '';
  for (const byte of bytes) {
    text += isPrintable(byte)
      ? String.fromCharCode(byte)
      : strings.symbols.invisible;
  }
  return text;
}

export function hexPairs(bytes: Iterable<number>): string {
  const pairs: string[] = [];
  for (const byte of bytes) {
    pairs.push(byte.toString(16).toUpperCase().padStart(2, '0'));
  }
  return pairs.join(' ');
}
