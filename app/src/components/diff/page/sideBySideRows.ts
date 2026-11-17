import type { DiffFile } from './diff';
import { changeBlocks } from './changeBlocks';
import { lineKey } from './lines';
import { changePairs, pairingBudget, type PairingBudget } from './pairing';
import type { Pair } from './wordDiff';
import type { DiffRow, WholeFile } from './rows';

export function showsSideBySide(
  sideBySide: boolean,
  whole: WholeFile | undefined,
): boolean {
  return sideBySide && !whole;
}

type SplitRow = Extract<DiffRow, { kind: 'split' | 'hunk' }>;

const splitRowsOfFile = new WeakMap<
  DiffFile,
  { readonly rows: readonly SplitRow[]; readonly words: number }
>();

export function splitRows(
  file: DiffFile,
  index: number,
  budget = pairingBudget(),
): readonly SplitRow[] {
  const known = splitRowsOfFile.get(file);
  let rows: readonly SplitRow[];
  if (known && !budget.spent && known.words <= budget.words) {
    budget.words -= known.words;
    rows = known.rows;
  } else {
    const before = budget.words;
    rows = alignedRows(file, index, budget);
    if (!budget.spent) {
      splitRowsOfFile.set(file, { rows, words: before - budget.words });
    }
  }
  return rows[0]?.file === index
    ? rows
    : rows.map((row) => ({ ...row, file: index }));
}

function alignedRows(
  file: DiffFile,
  index: number,
  budget: PairingBudget,
): SplitRow[] {
  const rows: SplitRow[] = [];
  for (const [number, blocks] of changeBlocks(file).entries()) {
    if (number > 0) {
      rows.push({ kind: 'hunk', file: index });
    }
    for (const block of blocks) {
      if (block.kind === 'context') {
        rows.push({
          kind: 'split',
          file: index,
          left: block.line,
          right: block.line,
        });
        continue;
      }
      const { removed, added } = block;
      for (const [left, right] of changePairs(block, budget)) {
        rows.push({
          kind: 'split',
          file: index,
          left: left === undefined ? undefined : removed[left],
          right: right === undefined ? undefined : added[right],
        });
      }
    }
  }
  return rows;
}

export function splitPairs(
  rows: readonly DiffRow[],
): ReadonlyMap<string, Pair> {
  const pairs = new Map<string, Pair>();
  for (const row of rows) {
    if (row.kind !== 'split' || row.left === row.right) {
      continue;
    }
    const pair = { removed: row.left, added: row.right };
    for (const side of [row.left, row.right]) {
      if (side) {
        pairs.set(lineKey(row.file, side.index), pair);
      }
    }
  }
  return pairs;
}
