import { linkMode } from '../shared/protocol';

type LineKind = 'context' | 'added' | 'removed';

export interface DiffLine {
  readonly kind: LineKind;
  readonly oldNumber: number | undefined;
  readonly newNumber: number | undefined;
  readonly text: string;
}

interface DiffHunk {
  readonly lines: DiffLine[];
}

interface Blobs {
  readonly old: string | undefined;
  readonly new: string | undefined;
}

export interface DiffFile {
  readonly path: string;
  readonly oldPath?: string;
  readonly binary: boolean;
  readonly hunks: DiffHunk[];
  readonly placeholder?: { readonly lines: number | undefined };
  readonly blobs?: Blobs;
  readonly whitespaceOnly?: boolean;
  readonly noNewlineAtEnd?: 'old' | 'new';
  readonly modeChange?: ModeChange;
  readonly copied?: true;
  readonly similarity?: number;
  readonly link?: LinkTargets;
}

interface ModeChange {
  readonly old: string;
  readonly new: string;
}

export interface LinkTargets {
  readonly old?: string;
  readonly new?: string;
}

type Side = keyof LinkTargets;

interface ParsedFile {
  header: string;
  path: string;
  oldPath?: string;
  copied: boolean;
  similarity?: number;
  modes: { old?: string; new?: string };
  sideModes: Partial<Record<Side, string>>;
  binary: boolean;
  hunks: DiffHunk[];
  blobs?: Blobs;
  addedOrDeleted: boolean;
  lacksNewline: Record<'old' | 'new', boolean>;
}

export interface NumberedLine {
  readonly line: DiffLine;
  readonly index: number;
}

export type ChangeBlock =
  | { readonly kind: 'context'; readonly line: NumberedLine }
  | {
      readonly kind: 'change';
      readonly removed: readonly NumberedLine[];
      readonly added: readonly NumberedLine[];
    };

const blocksOfFile = new WeakMap<DiffFile, readonly ChangeBlock[][]>();

export function changeBlocks(file: DiffFile): readonly ChangeBlock[][] {
  let blocks = blocksOfFile.get(file);
  if (!blocks) {
    blocks = hunkBlocks(file);
    blocksOfFile.set(file, blocks);
  }
  return blocks;
}

function hunkBlocks(file: DiffFile): ChangeBlock[][] {
  let next = 0;
  return file.hunks.map((hunk) => {
    const blocks: ChangeBlock[] = [];
    let removed: NumberedLine[] = [];
    let added: NumberedLine[] = [];
    const close = () => {
      if (removed.length > 0 || added.length > 0) {
        blocks.push({ kind: 'change', removed, added });
        removed = [];
        added = [];
      }
    };
    for (const line of hunk.lines) {
      const numbered = { line, index: next++ };
      if (line.kind === 'removed') {
        if (added.length > 0) {
          close();
        }
        removed.push(numbered);
      } else if (line.kind === 'added') {
        added.push(numbered);
      } else {
        close();
        blocks.push({ kind: 'context', line: numbered });
      }
    }
    close();
    return blocks;
  });
}

export function textKey(path: string, side: 'old' | 'new'): string {
  return `${side}:${path}`;
}

const hunkHeader = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

const indexLine = /^index ([0-9a-f]+)\.\.([0-9a-f]+)(?: (\d+))?/;

const blob = (id: string) => (/^0+$/.test(id) ? undefined : id);

const escapes: Record<string, number> = {
  a: 7,
  b: 8,
  t: 9,
  n: 10,
  v: 11,
  f: 12,
  r: 13,
  '"': 34,
  '\\': 92,
};

export function unquotePath(path: string): string {
  if (!path.startsWith('"') || !path.endsWith('"')) {
    return path;
  }
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const inner = Array.from(path.slice(1, -1));
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char !== '\\') {
      bytes.push(...encoder.encode(char));
      continue;
    }
    const next = inner[++i];
    if (/[0-7]/.test(next)) {
      bytes.push(Number.parseInt(inner.slice(i, i + 3).join(''), 8));
      i += 2;
    } else {
      bytes.push(escapes[next] ?? next.charCodeAt(0));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function prefixedPath(rest: string, prefix: string): string | undefined {
  const path = unquotePath(rest.replace(/\t$/, ''));
  return path.startsWith(prefix) ? path.slice(prefix.length) : undefined;
}

function headerPath(rest: string): string {
  const quoted = / "b\/((?:[^"\\]|\\.)*)"$/.exec(rest);
  if (quoted) {
    return unquotePath(`"${quoted[1]}"`);
  }
  const length = (rest.length - 5) / 2;
  if (
    Number.isInteger(length) &&
    rest.startsWith('a/') &&
    rest.slice(2 + length, 5 + length) === ' b/' &&
    rest.slice(2, 2 + length) === rest.slice(5 + length)
  ) {
    return rest.slice(5 + length);
  }
  const split = rest.lastIndexOf(' b/');
  return split === -1 ? rest : rest.slice(split + 3);
}

export function parseFilePatch(
  path: string,
  patch: string,
  whitespaceOnly = false,
): DiffFile {
  return (
    parsePatch(patch)[0] ?? {
      path,
      binary: false,
      hunks: [],
      ...(whitespaceOnly ? { whitespaceOnly } : {}),
    }
  );
}

export function parsePatch(patch: string): DiffFile[] {
  const files: ParsedFile[] = [];
  let file: ParsedFile | undefined;
  let hunk: DiffHunk | undefined;
  let oldNumber = 0;
  let newNumber = 0;

  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      hunk = undefined;
      if (file?.header === line) {
        continue;
      }
      file = {
        header: line,
        path: headerPath(line.slice('diff --git '.length)),
        copied: false,
        modes: {},
        sideModes: {},
        binary: false,
        hunks: [],
        addedOrDeleted: false,
        lacksNewline: { old: false, new: false },
      };
      files.push(file);
      continue;
    }
    if (!file) {
      continue;
    }
    const header = hunkHeader.exec(line);
    if (header) {
      oldNumber = Number(header[1]);
      newNumber = Number(header[2]);
      hunk = { lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) {
      const index = indexLine.exec(line);
      if (index) {
        file.blobs = {
          old: blob(index[1]) ?? file.blobs?.old,
          new: blob(index[2]) ?? file.blobs?.new,
        };
        const mode = index[3];
        if (mode !== undefined) {
          file.sideModes = { old: mode, new: mode };
        }
      } else if (line.startsWith('Binary files ')) {
        file.binary = true;
      } else if (line.startsWith('new file mode ')) {
        file.addedOrDeleted = true;
        file.sideModes.new = line.slice('new file mode '.length);
      } else if (line.startsWith('deleted file mode ')) {
        file.addedOrDeleted = true;
        file.sideModes.old = line.slice('deleted file mode '.length);
      } else if (line.startsWith('similarity index ')) {
        file.similarity = parseInt(line.slice('similarity index '.length), 10);
      } else if (line.startsWith('old mode ')) {
        file.modes.old = line.slice('old mode '.length);
      } else if (line.startsWith('new mode ')) {
        file.modes.new = line.slice('new mode '.length);
      } else if (line.startsWith('rename to ') || line.startsWith('copy to ')) {
        file.path = unquotePath(line.slice(line.indexOf(' to ') + 4));
      } else if (
        line.startsWith('rename from ') ||
        line.startsWith('copy from ')
      ) {
        file.oldPath = unquotePath(line.slice(line.indexOf(' from ') + 6));
        file.copied = line.startsWith('copy from ');
      } else if (line.startsWith('+++ ')) {
        const path = prefixedPath(line.slice(4), 'b/');
        if (path !== undefined) {
          file.path = path;
        }
      }
      continue;
    }
    const marker = line[0];
    const text = line.slice(1);
    if (marker === '+') {
      hunk.lines.push({
        kind: 'added',
        oldNumber: undefined,
        newNumber: newNumber++,
        text,
      });
    } else if (marker === '-') {
      hunk.lines.push({
        kind: 'removed',
        oldNumber: oldNumber++,
        newNumber: undefined,
        text,
      });
    } else if (marker === ' ') {
      hunk.lines.push({
        kind: 'context',
        oldNumber: oldNumber++,
        newNumber: newNumber++,
        text,
      });
    } else if (marker === '\\') {
      const kind = hunk.lines.at(-1)?.kind;
      file.lacksNewline.old ||= kind === 'removed' || kind === 'context';
      file.lacksNewline.new ||= kind === 'added' || kind === 'context';
    }
  }
  return files.map((parsed) => {
    const {
      path,
      oldPath,
      copied,
      similarity,
      modes,
      binary,
      blobs,
      addedOrDeleted,
      lacksNewline,
    } = parsed;
    const link = linkOf(parsed);
    return {
      path,
      ...(oldPath === undefined ? {} : { oldPath }),
      ...(copied ? { copied } : {}),
      ...(similarity === undefined ? {} : { similarity }),
      ...(modes.old !== undefined && modes.new !== undefined
        ? { modeChange: { old: modes.old, new: modes.new } }
        : {}),
      binary,
      hunks: fileLines(parsed.hunks, link),
      ...(blobs ? { blobs } : {}),
      ...(addedOrDeleted || lacksNewline.old === lacksNewline.new
        ? {}
        : { noNewlineAtEnd: lacksNewline.old ? 'old' : 'new' }),
      ...(link ? { link } : {}),
    };
  });
}

const sideLines: Record<Side, LineKind> = { old: 'removed', new: 'added' };

function linkOf({ hunks, sideModes }: ParsedFile): LinkTargets | undefined {
  const lines = hunks.flatMap((hunk) => hunk.lines);
  const target = (side: Side) => {
    const texts = lines
      .filter(
        (line) => line.kind === 'context' || line.kind === sideLines[side],
      )
      .map((line) => line.text);
    return sideModes[side] === linkMode && texts.length > 0
      ? texts.join('\n')
      : undefined;
  };
  const oldTarget = target('old');
  const newTarget = target('new');
  if (oldTarget === undefined && newTarget === undefined) {
    return undefined;
  }
  return {
    ...(oldTarget === undefined ? {} : { old: oldTarget }),
    ...(newTarget === undefined ? {} : { new: newTarget }),
  };
}

function fileLines(
  hunks: DiffHunk[],
  link: LinkTargets | undefined,
): DiffHunk[] {
  if (link === undefined) {
    return hunks;
  }
  const ofFile = (line: DiffLine) =>
    line.kind !== 'context' &&
    link[line.kind === 'removed' ? 'old' : 'new'] === undefined;
  return hunks
    .map((hunk) => ({ lines: hunk.lines.filter(ofFile) }))
    .filter((hunk) => hunk.lines.length > 0);
}
