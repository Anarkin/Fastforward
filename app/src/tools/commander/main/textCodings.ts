import type { TextEncoding } from '../shared/textEncodings';

export interface TextCoding {
  readonly unit: 1 | 2;
  readonly newline: Buffer;
  readonly carriageReturn: Buffer;
  readonly decode: (bytes: Buffer) => string;
  readonly boundaryBefore: (bytes: Buffer, at: number) => number;
}

export const continuation = (byte: number | undefined) =>
  byte !== undefined && (byte & 0xc0) === 0x80;

export const utf8: TextCoding = {
  unit: 1,
  newline: Buffer.from([0x0a]),
  carriageReturn: Buffer.from([0x0d]),
  decode: (bytes) => bytes.toString('utf8'),
  boundaryBefore: (bytes, at) => {
    let index = at;
    while (index > 0 && continuation(bytes[index])) {
      index--;
    }
    return index;
  },
};

function singleByte(encoding: TextEncoding): TextCoding {
  const decoder = new TextDecoder(encoding);
  return {
    unit: 1,
    newline: utf8.newline,
    carriageReturn: utf8.carriageReturn,
    decode: (bytes) => decoder.decode(bytes),
    boundaryBefore: (_bytes, at) => at,
  };
}

export const high = (value: number) => value >= 0xd800 && value <= 0xdbff;

function utf16(encoding: 'utf-16le' | 'utf-16be'): TextCoding {
  const little = encoding === 'utf-16le';
  const decoder = new TextDecoder(encoding);
  const unitOf = (code: number) => Buffer.from(little ? [code, 0] : [0, code]);
  const valueAt = (bytes: Buffer, index: number) =>
    little
      ? (bytes[index] ?? 0) | ((bytes[index + 1] ?? 0) << 8)
      : ((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0);
  return {
    unit: 2,
    newline: unitOf(0x0a),
    carriageReturn: unitOf(0x0d),
    decode: (bytes) => decoder.decode(bytes),
    boundaryBefore: (bytes, at) => {
      const index = at - (at % 2);
      return index >= 2 && high(valueAt(bytes, index - 2)) ? index - 2 : index;
    },
  };
}

const codings = new Map<TextEncoding, TextCoding>();

export function codingOf(encoding: TextEncoding): TextCoding {
  let coding = codings.get(encoding);
  if (coding === undefined) {
    coding =
      encoding === 'utf-8'
        ? utf8
        : encoding === 'utf-16le' || encoding === 'utf-16be'
          ? utf16(encoding)
          : singleByte(encoding);
    codings.set(encoding, coding);
  }
  return coding;
}
