import {
  groundBehind,
  layerOf,
  lookWithin,
  probedIn,
  probedRow,
  solidOn,
} from '../../cells/page/cellLook';
import type { RowTints } from '../../cells/page/cellPainting';
import { tintsOver, type TextLook } from '../../cells/page/textCells';
import type { FindRange } from './find';
import type { Change } from './rows';
import type { LineWords } from './wordDiff';

export const lineClass = 'diff-line';

const wordOf: Readonly<Record<Change, string>> = {
  added: 'added-word',
  removed: 'removed-word',
};

const wordClassOf: Readonly<Record<Change, string>> = {
  added: 'word-added',
  removed: 'word-removed',
};

const changes: readonly Change[] = ['added', 'removed'];

export function diffLookOf(host: Element): TextLook {
  const row = probedRow(host, lineClass);
  const ground = groundBehind(host.closest('.virtual-rows'));
  const look = lookWithin(row, ground);
  const border = probedIn(row, 'span', '');
  border.style.background = 'var(--color-border)';
  const line = solidOn(ground, border);
  row.remove();
  const tints = changes.flatMap((change) => {
    const tinted = probedRow(host, `${lineClass} ${change}`);
    const word = probedIn(tinted, 'span', wordClassOf[change]);
    const layers = [
      [change, layerOf(tinted)],
      [wordOf[change], layerOf(word)],
    ] as const;
    tinted.remove();
    return layers;
  });
  return { ...look, line, tints: new Map(tints) };
}

export function bandTint(
  change: Change | undefined,
  words: LineWords | undefined,
): string | undefined {
  return change === undefined
    ? undefined
    : words === 'whole'
      ? tintsOver(change, wordOf[change])
      : change;
}

const untinted: RowTints = {};

const ranged = (range: FindRange) => range.end > range.start;

const wordTint = (change: Change | undefined): string =>
  wordOf[change === 'removed' ? 'removed' : 'added'];

export function rowTints(
  change: Change | undefined,
  words: LineWords | undefined,
): RowTints {
  const row = bandTint(change, words);
  if (words === undefined || words === 'whole' || words.length === 0) {
    return row === undefined ? untinted : { row };
  }
  return {
    row,
    word: wordTint(change),
    words: words
      .filter(ranged)
      .map(({ start, end }) => ({ from: start, to: end })),
    gaps: words.filter((range) => !ranged(range)).map(({ start }) => start),
  };
}
