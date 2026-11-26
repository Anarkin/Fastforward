import type { TextEncoding } from './textEncodings';

const marks: readonly (readonly [TextEncoding, readonly number[]])[] = [
  ['utf-8', [0xef, 0xbb, 0xbf]],
  ['utf-16le', [0xff, 0xfe]],
  ['utf-16be', [0xfe, 0xff]],
];

const opensWith = (bytes: Uint8Array, mark: readonly number[]) =>
  bytes.length >= mark.length &&
  mark.every((byte, index) => bytes[index] === byte);

export const markBytesOf = (
  encoding: TextEncoding,
): readonly number[] | undefined =>
  marks.find(([marked]) => marked === encoding)?.[1];

export function startsWithMark(
  bytes: Uint8Array,
  encoding: TextEncoding,
): boolean {
  const mark = markBytesOf(encoding);
  return mark !== undefined && opensWith(bytes, mark);
}

export const byteOrderMarkOf = (bytes: Uint8Array): TextEncoding | undefined =>
  marks.find(([, mark]) => opensWith(bytes, mark))?.[0];

export const markCharacter = String.fromCodePoint(0xfe_ff);

export const withoutMark = (text: string): string =>
  text.startsWith(markCharacter) ? text.slice(markCharacter.length) : text;
