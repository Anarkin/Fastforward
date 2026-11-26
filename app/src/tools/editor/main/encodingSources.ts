import { byteOrderMarkOf } from '../../../components/encodings/shared/byteOrderMarks';
import type { EncodingSource } from '../shared/protocol';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import {
  isUtf8,
  utf16Order,
} from '../../../components/encodings/main/encodingDetection';

export function textEncodingOf(start: Buffer): TextEncoding | undefined {
  return byteOrderMarkOf(start) ?? utf16Order(start);
}

export const startBytes = 64 * 1024;

interface Found {
  readonly bom: TextEncoding | undefined;
  readonly order: TextEncoding | undefined;
  readonly valid: boolean;
  readonly encoding: TextEncoding;
}

export function foundIn(bytes: Buffer, codePage: TextEncoding): Found {
  const start = bytes.subarray(0, startBytes);
  const bom = byteOrderMarkOf(start);
  const order = bom === undefined ? utf16Order(start) : undefined;
  const valid = isUtf8(bytes);
  return {
    bom,
    order,
    valid,
    encoding: bom ?? order ?? (valid ? 'utf-8' : codePage),
  };
}

export function sourcesOf(
  { bom, order, valid }: Found,
  chosen: TextEncoding | undefined,
  codePage: TextEncoding,
): EncodingSource[] {
  return [
    { kind: 'chosen', ...(chosen !== undefined && { encoding: chosen }) },
    { kind: 'bom', ...(bom !== undefined && { encoding: bom }) },
    { kind: 'utf16', ...(order !== undefined && { encoding: order }) },
    { kind: 'utf8', ...(valid && { encoding: 'utf-8' }) },
    { kind: 'codePage', encoding: codePage },
  ];
}
