import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Compared } from '../../../shell/main/savedTabs';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import { decodedText } from '../../../components/encodings/main/encodingDetection';
import { compareMaxBytes } from './compare';

export interface DecodedSides {
  readonly read: Compared;
  readonly encodings: {
    readonly old?: TextEncoding;
    readonly new?: TextEncoding;
  };
}

interface DecodedSide {
  readonly file: string;
  readonly encoding?: TextEncoding;
}

async function decodedSide(
  file: string,
  copies: string,
  codePage: () => Promise<TextEncoding>,
): Promise<DecodedSide> {
  const size = (await stat(file).catch(() => undefined))?.size;
  if (size === undefined || size > compareMaxBytes) {
    return { file };
  }
  const bytes = await readFile(file);
  const decoded = decodedText(bytes, await codePage());
  if (decoded === undefined || (decoded.encoding === 'utf-8' && !decoded.bom)) {
    return { file };
  }
  const copy = join(
    copies,
    createHash('sha256').update(bytes).digest('hex'),
    basename(file),
  );
  if ((await stat(copy).catch(() => undefined))?.isFile() !== true) {
    await mkdir(join(copy, '..'), { recursive: true });
    await writeFile(copy, decoded.text, 'utf8');
  }
  return { file: copy, encoding: decoded.encoding };
}

export async function decodedSides(
  read: Compared,
  copies: string,
  codePage: () => Promise<TextEncoding>,
): Promise<DecodedSides> {
  const [old, changed] = await Promise.all([
    decodedSide(read.old, copies, codePage),
    decodedSide(read.new, copies, codePage),
  ]);
  return {
    read: { ...read, old: old.file, new: changed.file },
    encodings: {
      ...(old.encoding !== undefined && { old: old.encoding }),
      ...(changed.encoding !== undefined && { new: changed.encoding }),
    },
  };
}
