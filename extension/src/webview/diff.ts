// Parses the unified diff that git produces into files, hunks and numbered
// lines

export type LineKind = 'context' | 'added' | 'removed';

export interface DiffLine {
  readonly kind: LineKind;
  readonly oldNumber: number | undefined;
  readonly newNumber: number | undefined;
  readonly text: string;
}

export interface DiffHunk {
  readonly header: string;
  readonly lines: DiffLine[];
}

export interface DiffFile {
  readonly path: string;
  readonly binary: boolean;
  readonly hunks: DiffHunk[];
}

const hunkHeader = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/;

export function parsePatch(patch: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | undefined;
  let hunk: DiffHunk | undefined;
  let oldNumber = 0;
  let newNumber = 0;

  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      // Paths are "a/<path> b/<path>"; the +++ line below is more reliable, but
      // binary and mode-only changes don't have one
      const match = / b\/(.*)$/.exec(line);
      file = { path: match?.[1] ?? line, binary: false, hunks: [] };
      files.push(file);
      hunk = undefined;
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
        files[files.length - 1] = { ...file, binary: true };
        file = files[files.length - 1];
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
  return files;
}
