import {
  EditorSelection,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type TransactionSpec,
} from '@codemirror/state';
import { standsAlone } from '../../../lib/shared/textMatches';
import { wordAt } from './words';

const steppingWords = StateEffect.define<boolean>();

const steppingField = StateField.define<boolean>({
  create: () => false,
  update(stepping, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(steppingWords)) {
        return effect.value;
      }
    }
    return transaction.selection === undefined && stepping;
  },
});

export const occurrenceStepping: Extension = steppingField;

export function stepsWords(state: EditorState): boolean {
  return state.field(steppingField, false) === true;
}

export function nextOccurrence(
  state: EditorState,
): TransactionSpec | undefined {
  const { main, ranges } = state.selection;
  if (main.empty) {
    const word = wordAt(state, main.head);
    return (
      word && {
        selection: state.selection.replaceRange(
          EditorSelection.range(word.from, word.to),
        ),
        effects: steppingWords.of(true),
      }
    );
  }
  const searched = state.sliceDoc(main.from, main.to);
  const wordsOnly = stepsWords(state);
  const text = state.doc.toString();
  const taken = new Set(ranges.map((range) => range.from));
  const fits = (at: number) =>
    !taken.has(at) &&
    (!wordsOnly || standsAlone(text, at, at + searched.length));
  const nextFrom = (from: number) => {
    let at = text.indexOf(searched, from);
    while (at !== -1 && !fits(at)) {
      at = text.indexOf(searched, at + 1);
    }
    return at;
  };
  const last = ranges.reduce((most, range) => Math.max(most, range.to), 0);
  const after = nextFrom(last);
  const found = after === -1 ? nextFrom(0) : after;
  if (found === -1) {
    return undefined;
  }
  return {
    selection: state.selection.addRange(
      EditorSelection.range(found, found + searched.length),
    ),
    effects: steppingWords.of(wordsOnly),
    scrollIntoView: true,
  };
}
