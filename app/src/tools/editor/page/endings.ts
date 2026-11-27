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
import { strings } from '../../../lib/shared/strings';
import {
  droppedMapped,
  marksAdded,
  marksDropped,
  marksListed,
  movedMarks,
  strayMarks,
  type DroppedMark,
  type EndingMark,
  type LineEnding,
  type StrayEnding,
} from '../shared/textMarks';

export interface Endings {
  readonly ending: LineEnding;
  readonly strays: RangeSet<EndingMark>;
}

const setEndings = StateEffect.define<Endings>();

const restoredStrays = StateEffect.define<readonly DroppedMark<EndingMark>[]>({
  map: droppedMapped,
});

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
      if (effect.is(restoredStrays)) {
        next = {
          ...next,
          strays: marksAdded(
            next.strays,
            transaction.newDoc,
            effect.value,
            '\n',
          ),
        };
      }
    }
    return next;
  },
});

export function endingAfter(
  { ending, strays }: Endings,
  lineEnd: number,
): LineEnding {
  let ended = ending;
  strays.between(lineEnd, lineEnd + 1, (_from, _to, mark) => {
    ended = mark.ending;
  });
  return ended;
}

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

export const endingsUndone = invertedEffects.of((transaction) => {
  const before = transaction.startState.field(endingsField, false);
  if (before === undefined) {
    return [];
  }
  const dropped = transaction.docChanged
    ? marksDropped(before.strays, transaction.changes)
    : [];
  return [
    ...(transaction.effects.some((effect) => effect.is(setEndings))
      ? [setEndings.of(before)]
      : []),
    ...(dropped.length > 0 ? [restoredStrays.of(dropped)] : []),
  ];
});

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
    transaction.effects.some(
      (effect) => effect.is(setEndings) || effect.is(restoredStrays),
    ),
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

const convertible: readonly LineEnding[] = ['lf', 'crlf'];

export interface Conversion {
  readonly ending: LineEnding;
  readonly label: string;
  readonly changes: boolean;
}

export const conversionsOf = (
  counts: Readonly<Record<LineEnding, number>>,
): readonly Conversion[] =>
  convertible.map((ending) => ({
    ending,
    label: strings.editor.convertTo(strings.editor.endingNames[ending]),
    changes: Object.entries(counts).some(
      ([other, count]) => other !== ending && count > 0,
    ),
  }));
