import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import {
  decodedText,
  type DecodedText,
} from '../../../components/encodings/main/encodingDetection';

export interface PatchSides {
  readonly bytesOf: (
    id: string,
    path: string,
    side: 'old' | 'new',
  ) => Promise<Buffer | undefined>;
  readonly hunksOf: (old: string, changed: string) => Promise<string>;
  readonly codePage: TextEncoding;
}

const sectionStart = 'diff --git ';

const unread = '�';

const binaryLine =
  /^Binary files (?:a\/(.+)|\/dev\/null) and (?:b\/(.+)|\/dev\/null) differ$/u;

const indexLine = /^index ([0-9a-f]+)\.\.([0-9a-f]+)/u;

const absent = /^0+$/u;

export function mayNeedDecoding(patch: string): boolean {
  return (
    patch.includes('\nBinary files ') ||
    patch.startsWith('Binary files ') ||
    patch.includes(unread)
  );
}

function sectionsOf(patch: string): string[] {
  const sections: string[] = [];
  let start = 0;
  for (
    let next = patch.indexOf(`\n${sectionStart}`);
    next !== -1;
    next = patch.indexOf(`\n${sectionStart}`, next + 1)
  ) {
    sections.push(patch.slice(start, next + 1));
    start = next + 1;
  }
  sections.push(patch.slice(start));
  return sections;
}

interface Sides {
  readonly old?: { readonly id: string; readonly path: string };
  readonly new?: { readonly id: string; readonly path: string };
  readonly headerEnd: number;
}

const pathOf = (line: string, prefix: string): string | undefined =>
  line.startsWith(prefix)
    ? line.slice(prefix.length).replace(/\t$/u, '')
    : undefined;

function sidesOf(lines: readonly string[]): Sides | undefined {
  const ids = lines
    .map((line) => indexLine.exec(line))
    .find((found) => found !== null);
  const headerEnd = lines.findIndex(
    (line) => line.startsWith('--- ') || line.startsWith('Binary files '),
  );
  if (ids === undefined || headerEnd === -1) {
    return undefined;
  }
  const binary = binaryLine.exec(lines[headerEnd] ?? '');
  const oldPath =
    binary === null ? pathOf(lines[headerEnd] ?? '', '--- a/') : binary[1];
  const newPath =
    binary === null ? pathOf(lines[headerEnd + 1] ?? '', '+++ b/') : binary[2];
  const [, oldId = '', newId = ''] = ids;
  const side = (id: string, path: string | undefined) =>
    absent.test(id) || path === undefined || path.startsWith('"')
      ? undefined
      : { id, path };
  const old = side(oldId, oldPath);
  const changed = side(newId, newPath);
  if (
    (old === undefined && !absent.test(oldId)) ||
    (changed === undefined && !absent.test(newId))
  ) {
    return undefined;
  }
  return {
    ...(old !== undefined && { old }),
    ...(changed !== undefined && { new: changed }),
    headerEnd,
  };
}

const plainUtf8 = (decoded: DecodedText | undefined) =>
  decoded === undefined || (decoded.encoding === 'utf-8' && !decoded.bom);

function hunksIn(diffed: string): string {
  if (diffed.startsWith('@@')) {
    return diffed;
  }
  const at = diffed.indexOf('\n@@');
  return at === -1 ? '' : diffed.slice(at + 1);
}

async function decodedSection(
  section: string,
  read: PatchSides,
): Promise<string> {
  const lines = section.split('\n');
  const sides = sidesOf(lines);
  if (sides === undefined) {
    return section;
  }
  const decode = async (
    side: Sides['old'],
    which: 'old' | 'new',
  ): Promise<DecodedText | null | undefined> => {
    if (side === undefined) {
      return null;
    }
    const bytes = await read.bytesOf(side.id, side.path, which);
    return bytes === undefined ? undefined : decodedText(bytes, read.codePage);
  };
  const [old, changed] = await Promise.all([
    decode(sides.old, 'old'),
    decode(sides.new, 'new'),
  ]);
  if (
    old === undefined ||
    changed === undefined ||
    (old === null && changed === null) ||
    (plainUtf8(old ?? undefined) && plainUtf8(changed ?? undefined))
  ) {
    return section;
  }
  const encoding = (old ?? changed)?.encoding;
  const hunks = hunksIn(
    await read.hunksOf(old?.text ?? '', changed?.text ?? ''),
  );
  const ending = section.endsWith('\n') ? '\n' : '';
  return (
    [
      ...lines.slice(0, sides.headerEnd),
      `encoding ${old?.encoding ?? encoding} ${changed?.encoding ?? encoding}`,
      sides.old === undefined ? '--- /dev/null' : `--- a/${sides.old.path}`,
      sides.new === undefined ? '+++ /dev/null' : `+++ b/${sides.new.path}`,
      ...(hunks === '' ? [] : [hunks.replace(/\n$/u, '')]),
    ].join('\n') + ending
  );
}

export async function decodedPatch(
  patch: string,
  read: PatchSides,
): Promise<string> {
  if (!mayNeedDecoding(patch)) {
    return patch;
  }
  const sections = sectionsOf(patch);
  const decoded = await Promise.all(
    sections.map((section) =>
      section.includes('\nBinary files ') || section.includes(unread)
        ? decodedSection(section, read)
        : Promise.resolve(section),
    ),
  );
  return decoded.join('');
}
