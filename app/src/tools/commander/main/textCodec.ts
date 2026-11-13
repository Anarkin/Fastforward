import type { TextEncoding } from '../shared/protocol';
import {
  keptPlaceholder,
  type KeptBytes,
  type LineEnding,
  type StrayEnding,
} from '../shared/textMarks';

export interface DecodedText {
  readonly text: string;
  readonly encoding: TextEncoding;
  readonly bom: boolean;
  readonly ending: LineEnding | undefined;
  readonly endings: Readonly<Record<LineEnding, number>>;
  readonly strayEndings: readonly StrayEnding[];
  readonly keptBytes: readonly KeptBytes[];
}

export interface TextToEncode {
  readonly text: string;
  readonly encoding: TextEncoding;
  readonly bom: boolean;
  readonly ending: LineEnding;
  readonly strayEndings: readonly StrayEnding[];
  readonly keptBytes: readonly KeptBytes[];
}

interface Unencodable {
  readonly at: number;
  readonly character: string;
}

export type EncodedText =
  | { readonly bytes: Uint8Array }
  | { readonly unencodable: readonly Unencodable[] };

const byteOrderMarks: Partial<Record<TextEncoding, readonly number[]>> = {
  'utf-8': [0xef, 0xbb, 0xbf],
  'utf-16le': [0xff, 0xfe],
  'utf-16be': [0xfe, 0xff],
};

const endingTexts: Readonly<Record<LineEnding, string>> = {
  lf: '\n',
  crlf: '\r\n',
  cr: '\r',
};

interface Raw {
  readonly text: string;
  readonly kept: readonly KeptBytes[];
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return (
    bytes.length >= prefix.length &&
    prefix.every((byte, index) => bytes[index] === byte)
  );
}

const isContinuation = (byte: number | undefined) =>
  byte !== undefined && byte >= 0x80 && byte <= 0xbf;

function utf8Length(bytes: Uint8Array, at: number): number {
  const lead = bytes[at];
  if (lead < 0x80) {
    return 1;
  }
  const second = bytes[at + 1];
  if (lead >= 0xc2 && lead <= 0xdf) {
    return isContinuation(second) ? 2 : 0;
  }
  const secondFits =
    second !== undefined &&
    (lead === 0xe0
      ? second >= 0xa0 && second <= 0xbf
      : lead === 0xed
        ? second >= 0x80 && second <= 0x9f
        : lead === 0xf0
          ? second >= 0x90 && second <= 0xbf
          : lead === 0xf4
            ? second >= 0x80 && second <= 0x8f
            : isContinuation(second));
  if (lead >= 0xe0 && lead <= 0xef) {
    return secondFits && isContinuation(bytes[at + 2]) ? 3 : 0;
  }
  if (lead >= 0xf0 && lead <= 0xf4) {
    return secondFits &&
      isContinuation(bytes[at + 2]) &&
      isContinuation(bytes[at + 3])
      ? 4
      : 0;
  }
  return 0;
}

const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const looseUtf8 = new TextDecoder('utf-8', { ignoreBOM: true });

function rawUtf8(bytes: Uint8Array): Raw {
  try {
    return { text: strictUtf8.decode(bytes), kept: [] };
  } catch {
    const parts: string[] = [];
    const kept: KeptBytes[] = [];
    let length = 0;
    let start = 0;
    const flush = (end: number) => {
      if (end > start) {
        const part = looseUtf8.decode(bytes.subarray(start, end));
        parts.push(part);
        length += part.length;
      }
    };
    for (let at = 0; at < bytes.length;) {
      const size = utf8Length(bytes, at);
      if (size > 0) {
        at += size;
        continue;
      }
      flush(at);
      kept.push({ at: length, bytes: [bytes[at]] });
      parts.push(keptPlaceholder);
      length += 1;
      at += 1;
      start = at;
    }
    flush(bytes.length);
    return { text: parts.join(''), kept };
  }
}

const isHigh = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const isLow = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;

function rawUtf16(bytes: Uint8Array, littleEndian: boolean): Raw {
  const units = Math.floor(bytes.length / 2);
  const unitAt = (index: number) =>
    littleEndian
      ? bytes[index * 2] | (bytes[index * 2 + 1] << 8)
      : (bytes[index * 2] << 8) | bytes[index * 2 + 1];
  const parts: string[] = [];
  const kept: KeptBytes[] = [];
  let run: number[] = [];
  let length = 0;
  const flush = () => {
    if (run.length > 0) {
      const part = String.fromCharCode(...run);
      parts.push(part);
      length += part.length;
      run = [];
    }
  };
  const keep = (keptBytes: number[]) => {
    flush();
    kept.push({ at: length, bytes: keptBytes });
    parts.push(keptPlaceholder);
    length += 1;
  };
  for (let index = 0; index < units; index++) {
    const unit = unitAt(index);
    if (isHigh(unit) && index + 1 < units && isLow(unitAt(index + 1))) {
      run.push(unit, unitAt(index + 1));
      index += 1;
    } else if (isHigh(unit) || isLow(unit)) {
      keep([bytes[index * 2], bytes[index * 2 + 1]]);
    } else {
      run.push(unit);
    }
    if (run.length >= 4096) {
      flush();
    }
  }
  if (bytes.length % 2 === 1) {
    keep([bytes[bytes.length - 1]]);
  }
  flush();
  return { text: parts.join(''), kept };
}

const singleByteTables = new Map<TextEncoding, Map<string, number>>();

function bytesOfCharacters(encoding: TextEncoding): Map<string, number> {
  let table = singleByteTables.get(encoding);
  if (table === undefined) {
    const decoder = new TextDecoder(encoding);
    table = new Map();
    for (let byte = 0; byte < 256; byte++) {
      const character = decoder.decode(Uint8Array.of(byte));
      if (character !== keptPlaceholder && !table.has(character)) {
        table.set(character, byte);
      }
    }
    singleByteTables.set(encoding, table);
  }
  return table;
}

function rawSingleByte(bytes: Uint8Array, encoding: TextEncoding): Raw {
  const text = new TextDecoder(encoding).decode(bytes);
  const kept: KeptBytes[] = [];
  for (
    let at = text.indexOf(keptPlaceholder);
    at !== -1;
    at = text.indexOf(keptPlaceholder, at + 1)
  ) {
    kept.push({ at, bytes: [bytes[at]] });
  }
  return { text, kept };
}

function rawText(bytes: Uint8Array, encoding: TextEncoding): Raw {
  if (encoding === 'utf-8') {
    return rawUtf8(bytes);
  }
  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    return rawUtf16(bytes, encoding === 'utf-16le');
  }
  return rawSingleByte(bytes, encoding);
}

const lineBreak = /\r\n?|\n/g;

const endingOf = (found: string): LineEnding =>
  found === '\n' ? 'lf' : found === '\r' ? 'cr' : 'crlf';

export function decodedText(
  bytes: Uint8Array,
  encoding: TextEncoding,
): DecodedText {
  const mark = byteOrderMarks[encoding];
  const bom = mark !== undefined && startsWith(bytes, mark);
  const raw = rawText(bytes.subarray(bom ? (mark?.length ?? 0) : 0), encoding);
  const endings = { lf: 0, crlf: 0, cr: 0 };
  const breaks: StrayEnding[] = [];
  const parts: string[] = [];
  const kept: KeptBytes[] = [];
  let from = 0;
  let removed = 0;
  let nextKept = 0;
  const keepUpTo = (rawAt: number) => {
    while (nextKept < raw.kept.length && raw.kept[nextKept].at < rawAt) {
      const each = raw.kept[nextKept];
      kept.push({ at: each.at - removed, bytes: each.bytes });
      nextKept++;
    }
  };
  for (const found of raw.text.matchAll(lineBreak)) {
    const ending = endingOf(found[0]);
    endings[ending]++;
    keepUpTo(found.index);
    parts.push(raw.text.slice(from, found.index), '\n');
    breaks.push({ at: found.index - removed, ending });
    removed += found[0].length - 1;
    from = found.index + found[0].length;
  }
  keepUpTo(Infinity);
  parts.push(raw.text.slice(from));
  const most = Math.max(endings.lf, endings.crlf, endings.cr);
  const ending =
    most === 0
      ? undefined
      : breaks.find((each) => endings[each.ending] === most)?.ending;
  return {
    text: parts.join(''),
    encoding,
    bom,
    ending,
    endings,
    strayEndings: breaks.filter((each) => each.ending !== ending),
    keptBytes: kept,
  };
}

type PieceEncoder = (
  piece: string,
  at: number,
  unencodable: Unencodable[],
) => readonly number[] | Uint8Array;

const utf8Encoder = new TextEncoder();

const loneSurrogate =
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

function encodeUtf8(
  piece: string,
  at: number,
  unencodable: Unencodable[],
): Uint8Array {
  if (!piece.isWellFormed()) {
    for (const found of piece.matchAll(loneSurrogate)) {
      unencodable.push({ at: at + found.index, character: found[0] });
    }
  }
  return utf8Encoder.encode(piece);
}

function utf16Encoder(littleEndian: boolean): PieceEncoder {
  return (piece) => {
    const bytes = new Uint8Array(piece.length * 2);
    for (let index = 0; index < piece.length; index++) {
      const unit = piece.charCodeAt(index);
      bytes[index * 2 + (littleEndian ? 0 : 1)] = unit & 0xff;
      bytes[index * 2 + (littleEndian ? 1 : 0)] = unit >> 8;
    }
    return bytes;
  };
}

function singleByteEncoder(encoding: TextEncoding): PieceEncoder {
  const table = bytesOfCharacters(encoding);
  return (piece, at, unencodable) => {
    const bytes = new Uint8Array(piece.length);
    let length = 0;
    let offset = 0;
    for (const character of piece) {
      const byte = table.get(character);
      if (byte === undefined) {
        unencodable.push({ at: at + offset, character });
      } else {
        bytes[length++] = byte;
      }
      offset += character.length;
    }
    return bytes.subarray(0, length);
  };
}

function pieceEncoder(encoding: TextEncoding): PieceEncoder {
  if (encoding === 'utf-8') {
    return encodeUtf8;
  }
  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    return utf16Encoder(encoding === 'utf-16le');
  }
  return singleByteEncoder(encoding);
}

const maxUnencodable = 20;

export function encodedText({
  text,
  encoding,
  bom,
  ending,
  strayEndings,
  keptBytes,
}: TextToEncode): EncodedText {
  const encode = pieceEncoder(encoding);
  const strays = new Map(
    strayEndings
      .filter((each) => text[each.at] === '\n')
      .map((each) => [each.at, each.ending]),
  );
  const kept = new Map(
    keptBytes
      .filter((each) => text[each.at] === keptPlaceholder)
      .map((each) => [each.at, each.bytes]),
  );
  const marked = [...strays.keys(), ...kept.keys()];
  const special = new Set(marked);
  const chunks: (readonly number[] | Uint8Array)[] = [];
  const unencodable: Unencodable[] = [];
  const mark = bom ? byteOrderMarks[encoding] : undefined;
  if (mark !== undefined) {
    chunks.push(mark);
  }
  let from = 0;
  const flush = (to: number) => {
    if (to > from) {
      chunks.push(encode(text.slice(from, to), from, unencodable));
    }
  };
  for (let at = 0; at < text.length; at++) {
    const isBreak = text.charCodeAt(at) === 0x0a;
    if (!isBreak && !special.has(at)) {
      continue;
    }
    flush(at);
    const bytes = kept.get(at);
    chunks.push(
      bytes ?? encode(endingTexts[strays.get(at) ?? ending], at, unencodable),
    );
    from = at + 1;
  }
  flush(text.length);
  if (unencodable.length > 0) {
    return { unencodable: unencodable.slice(0, maxUnencodable) };
  }
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes };
}
