type LineKind = 'context' | 'added' | 'removed';

export interface DiffLine {
  readonly kind: LineKind;
  readonly oldNumber: number | undefined;
  readonly newNumber: number | undefined;
  readonly text: string;
}

interface DiffHunk {
  readonly header: string;
  readonly lines: DiffLine[];
}

export interface DiffFile {
  readonly path: string;
  readonly binary: boolean;
  readonly hunks: DiffHunk[];
  readonly placeholder?: { readonly lines: number };
}

interface ParsedFile {
  header: string;
  path: string;
  binary: boolean;
  hunks: DiffHunk[];
}

const hunkHeader = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/;

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
  const inner = path.slice(1, -1);
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char !== '\\') {
      bytes.push(...encoder.encode(char));
      continue;
    }
    const next = inner[++i];
    if (/[0-7]/.test(next)) {
      bytes.push(Number.parseInt(inner.slice(i, i + 3), 8));
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

export function parseFilePatch(path: string, patch: string): DiffFile {
  return parsePatch(patch)[0] ?? { path, binary: false, hunks: [] };
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
        binary: false,
        hunks: [],
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
      hunk = { header: header[3], lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) {
      if (line.startsWith('Binary files ')) {
        file.binary = true;
      } else if (line.startsWith('rename to ') || line.startsWith('copy to ')) {
        file.path = unquotePath(line.slice(line.indexOf(' to ') + 4));
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
    }
  }
  return files.map(({ path, binary, hunks }) => ({ path, binary, hunks }));
}
