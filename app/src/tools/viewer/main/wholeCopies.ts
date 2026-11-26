import { withoutMark } from '../../../components/encodings/shared/byteOrderMarks';
import { fs } from '../../../lib/main/files';
import { codingOf } from '../../../components/encodings/main/textCodings';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import { byteText, hexPairs } from '../shared/byteText';
import {
  maxBytesCopied,
  maxTextCopied,
  type CopiedAs,
} from '../shared/protocol';

export type WholeCopy =
  | { readonly kind: 'copied'; readonly text: string }
  | {
      readonly kind: 'tooLarge';
      readonly megabytes: string;
      readonly most: number;
      readonly as: 'text' | 'bytes';
    };

const megabyte = 1024 * 1024;

export async function wholeCopy(
  file: string,
  size: number,
  as: CopiedAs,
  encoding: TextEncoding,
): Promise<WholeCopy> {
  const most = as === 'text' ? maxTextCopied : maxBytesCopied;
  if (size > most) {
    return {
      kind: 'tooLarge',
      megabytes: (size / megabyte).toFixed(1),
      most: most / megabyte,
      as: as === 'text' ? 'text' : 'bytes',
    };
  }
  const bytes = await fs.promises.readFile(file);
  if (as === 'hex') {
    return { kind: 'copied', text: hexPairs(bytes) };
  }
  if (as === 'bytes') {
    return { kind: 'copied', text: byteText(bytes) };
  }
  const text = codingOf(encoding).decode(bytes);
  return {
    kind: 'copied',
    text: withoutMark(text),
  };
}
