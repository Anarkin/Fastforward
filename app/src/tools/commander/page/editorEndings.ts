import { invertedEffects } from '@codemirror/commands';
import {
  RangeSet,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text,
  type TransactionSpec,
} from '@codemirror/state';
import {
  marksListed,
  movedMarks,
  strayMarks,
  type EndingMark,
  type LineEnding,
  type StrayEnding,
} from '../shared/textMarks';

export interface Endings {
  readonly ending: LineEnding;
  readonly strays: RangeSet<EndingMark>;
}

const setEndings = StateEffect.define<Endings>();

export const endingsField = StateField.define<Endings>({
  create: () => ({ ending: 'lf', strays: RangeSet.empty }),
  update(value, transaction) {
    let next = transaction.docChanged
      ? { ...value, strays: movedMarks(value.strays, transaction.changes) }
      : value;
    for (const effect of transaction.effects) {
      if (effect.is(setEndings)) {
        next = effect.value;
      }
    }
    return next;
  },
});

export function endingsFrom(
  doc: Text,
  shown: {
    readonly ending: LineEnding;
    readonly strayEndings: readonly StrayEnding[];
  },
): Extension {
  return endingsField.init(() => ({
    ending: shown.ending,
    strays: strayMarks(doc, shown.strayEndings),
  }));
}

export const endingsUndone = invertedEffects.of((transaction) =>
  transaction.effects.some((effect) => effect.is(setEndings))
    ? [setEndings.of(transaction.startState.field(endingsField))]
    : [],
);

export function convertedTo(ending: LineEnding): TransactionSpec {
  return {
    effects: setEndings.of({ ending, strays: RangeSet.empty }),
    userEvent: 'convert',
  };
}

export function endingsChanged(
  transactions: readonly {
    readonly effects: readonly StateEffect<unknown>[];
  }[],
): boolean {
  return transactions.some((transaction) =>
    transaction.effects.some((effect) => effect.is(setEndings)),
  );
}

export function endingsSent({ ending, strays }: Endings): {
  readonly ending: LineEnding;
  readonly strayEndings: readonly StrayEnding[];
} {
  return {
    ending,
    strayEndings: marksListed(strays, (at, mark) => ({
      at,
      ending: mark.ending,
    })),
  };
}

export function endingCounts(
  state: EditorState,
): Readonly<Record<LineEnding, number>> {
  const { ending, strays } = state.field(endingsField);
  const counts = { lf: 0, crlf: 0, cr: 0 };
  let stray = 0;
  for (const cursor = strays.iter(); cursor.value !== null; cursor.next()) {
    counts[cursor.value.ending] += 1;
    stray += 1;
  }
  counts[ending] += state.doc.lines - 1 - stray;
  return counts;
}
