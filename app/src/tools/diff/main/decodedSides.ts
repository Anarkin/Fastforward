import { createHash, randomUUID } from 'node:crypto';
import { fsPromises } from '../../../lib/main/files';
import { basename, join } from 'node:path';
import type { Compared } from '../../../shell/main/savedTabs';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import { decodedText } from '../../../components/encodings/main/encodingDetection';
import type { ComparedSide } from '../shared/protocol';
import { compareMaxBytes } from './compare';

export interface DecodedSides {
  readonly read: Compared;
  readonly encodings: {
    readonly old?: TextEncoding;
    readonly new?: TextEncoding;
  };
  readonly withBom?: readonly ComparedSide[];
}

interface DecodedSide {
  readonly file: string;
  readonly encoding?: TextEncoding;
  readonly bom?: boolean;
}

async function writtenWhole(file: string, text: string): Promise<void> {
  const writing = `${file}.${randomUUID()}`;
  await fsPromises.writeFile(writing, text, 'utf8');
  try {
    await fsPromises.rename(writing, file);
  } catch (failure) {
    await fsPromises.rm(writing, { force: true });
    if (
      (await fsPromises.stat(file).catch(() => undefined))?.isFile() !== true
    ) {
      throw failure;
    }
  }
}

async function decodedSide(
  file: string,
  copies: string,
  codePage: () => Promise<TextEncoding>,
): Promise<DecodedSide> {
  const size = (await fsPromises.stat(file).catch(() => undefined))?.size;
  if (size === undefined || size > compareMaxBytes) {
    return { file };
  }
  const bytes = await fsPromises.readFile(file);
  const decoded = decodedText(bytes, await codePage());
  if (decoded === undefined || (decoded.encoding === 'utf-8' && !decoded.bom)) {
    return { file };
  }
  const copy = join(
    copies,
    createHash('sha256').update(bytes).digest('hex'),
    basename(file),
  );
  if ((await fsPromises.stat(copy).catch(() => undefined))?.isFile() !== true) {
    await fsPromises.mkdir(join(copy, '..'), { recursive: true });
    await writtenWhole(copy, decoded.text);
  }
  return { file: copy, encoding: decoded.encoding, bom: decoded.bom };
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
  const withBom = (
    [
      ['old', old],
      ['new', changed],
    ] as const
  )
    .filter(([, side]) => side.encoding === 'utf-8' && side.bom === true)
    .map(([name]) => name);
  return {
    read: { ...read, old: old.file, new: changed.file },
    encodings: {
      ...(old.encoding !== undefined && { old: old.encoding }),
      ...(changed.encoding !== undefined && { new: changed.encoding }),
    },
    ...(withBom.length > 0 && { withBom }),
  };
}
