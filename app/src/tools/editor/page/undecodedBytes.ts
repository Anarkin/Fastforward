import { invertedEffects } from '@codemirror/commands';
import {
  RangeSet,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text,
} from '@codemirror/state';
import {
  droppedMapped,
  keptMarks,
  keptPlaceholder,
  marksAdded,
  marksDropped,
  marksListed,
  movedMarks,
  type DroppedMark,
  type KeptBytes,
  type KeptMark,
} from '../shared/textMarks';

const restoredKept = StateEffect.define<readonly DroppedMark<KeptMark>[]>({
  map: droppedMapped,
});

const keptField = StateField.define<RangeSet<KeptMark>>({
  create: () => RangeSet.empty,
  update(kept, transaction) {
    let next = transaction.docChanged
      ? movedMarks(kept, transaction.changes)
      : kept;
    for (const effect of transaction.effects) {
      if (effect.is(restoredKept)) {
        next = marksAdded(
          next,
          transaction.newDoc,
          effect.value,
          keptPlaceholder,
        );
      }
    }
    return next;
  },
});

export const keptFrom = (
  doc: Text,
  shown: { readonly keptBytes: readonly KeptBytes[] },
): Extension => keptField.init(() => keptMarks(doc, shown.keptBytes));

export const keptUndone = invertedEffects.of((transaction) => {
  const before = transaction.startState.field(keptField, false);
  const dropped =
    before === undefined || !transaction.docChanged
      ? []
      : marksDropped(before, transaction.changes);
  return dropped.length > 0 ? [restoredKept.of(dropped)] : [];
});

export const keptRestored = (
  transactions: readonly {
    readonly effects: readonly StateEffect<unknown>[];
  }[],
): boolean =>
  transactions.some((transaction) =>
    transaction.effects.some((effect) => effect.is(restoredKept)),
  );

export const keptSent = (state: EditorState): KeptBytes[] =>
  marksListed(state.field(keptField), (at, { bytes }) => ({ at, bytes }));
