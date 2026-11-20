import type { DiffFile } from '../../../../../components/diff/page/diff';
import { diffRows, fileNotes } from '../../../../../components/diff/page/rows';
import { plainOf } from '../../../../../lib/shared/sentences';

export function patch(path: string, added: number): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -0,0 +1,${added} @@`,
    ...Array.from({ length: added }, (_, index) => `+line ${index}`),
  ].join('\n');
}

export const kinds = (rows: ReturnType<typeof diffRows>) =>
  rows.map((row) => row.kind);

export const noted = (
  files: readonly DiffFile[],
  rows: ReturnType<typeof diffRows>,
) =>
  rows.map((row) => {
    const file = row.kind === 'file' ? files[row.file] : undefined;
    const notes = file === undefined ? [] : fileNotes(file).map(plainOf);
    return notes.length === 0 ? row.kind : `${row.kind}: ${notes.join(', ')}`;
  });

export function sized(...sizes: number[]) {
  let start = 0;
  return sizes.map((size) => {
    const row = { start, size };
    start += size;
    return row;
  });
}
