import * as path from 'node:path';
import type { ArchiveItem, ArchiveListing } from './archiveReader';
import { passwordGiven, type SevenZip } from './sevenZip';
import { refusalOf } from './sevenZipOutput';

const itemsStart = '----------';
const timePattern =
  /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?/;

function fieldsOf(block: readonly string[]): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const line of block) {
    const at = line.indexOf(' = ');
    if (at > 0) {
      fields.set(line.slice(0, at), line.slice(at + 3));
    }
  }
  return fields;
}

function timeOf(text: string | undefined): number | undefined {
  const found = text === undefined ? null : timePattern.exec(text);
  if (found === null) {
    return undefined;
  }
  const [, year, month, day, hour, minute, second, fraction = '0'] = found;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(fraction.padEnd(3, '0')),
  );
}

function sizeOf(text: string | undefined): number | undefined {
  const size = text === undefined || text === '' ? Number.NaN : Number(text);
  return Number.isSafeInteger(size) ? size : undefined;
}

const tarShorthand = /\.t(?:az|bz2?|gz|pz|xz|zst)$/i;

function nameExtractedOf(file: string): string {
  const name = path.basename(file).replace(/\.\d{3,}$/, '');
  if (tarShorthand.test(name)) {
    return name.replace(/\.[^.]+$/, '.tar');
  }
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function itemOf(
  fields: ReadonlyMap<string, string>,
  file: string,
): ArchiveItem | undefined {
  const itemPath =
    fields.get('Path') ??
    (fields.has('Size') ? nameExtractedOf(file) : undefined);
  if (itemPath === undefined) {
    return undefined;
  }
  const [letters = ''] = (fields.get('Attributes') ?? '').split(' ');
  const marked = fields.get('Folder');
  const folder = marked === undefined ? letters.includes('D') : marked === '+';
  return {
    path: itemPath,
    folder,
    size: folder ? undefined : sizeOf(fields.get('Size')),
    modified: timeOf(fields.get('Modified')),
    hiddenAttribute: letters.includes('H'),
    link: (fields.get('Symbolic Link') ?? '') !== '',
    encrypted: fields.get('Encrypted') === '+',
  };
}

export async function listed(
  sevenZip: SevenZip,
  file: string,
  signal?: AbortSignal,
  password?: string,
): Promise<ArchiveListing> {
  const { switches, input } = passwordGiven(password);
  const run = await sevenZip(
    ['l', '-slt', '-sccUTF-8', '-slsl', '-slmu', ...switches, '--', file],
    { signal, input },
  );
  const lines = run.output.split(/\r?\n/);
  const start = lines.indexOf(itemsStart);
  if ((run.code !== 0 && run.code !== 1) || start < 0) {
    return { kind: 'refused', ...refusalOf(run, file) };
  }
  const items: ArchiveItem[] = [];
  let block: string[] = [];
  for (const line of [...lines.slice(start + 1), '']) {
    if (line !== '') {
      block.push(line);
      continue;
    }
    const item = itemOf(fieldsOf(block), file);
    if (item !== undefined) {
      items.push(item);
    }
    block = [];
  }
  return { kind: 'listed', items };
}
