import type { DiffFile, DiffLine } from './diff';

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
