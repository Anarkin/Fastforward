import {
  ChangeSet,
  StateEffect,
  StateField,
  type ChangeSpec,
  type EditorState,
  type Extension,
  type TransactionSpec,
} from '@codemirror/state';

interface SavingRules {
  readonly trimTrailingWhitespace: boolean;
  readonly insertFinalNewline: boolean;
}

const noRules: SavingRules = {
  trimTrailingWhitespace: false,
  insertFinalNewline: false,
};

export const savingRulesField = StateField.define<SavingRules>({
  create: () => noRules,
  update: (rules) => rules,
});

export const savingRulesOf = (shown: {
  readonly trimTrailingWhitespace?: boolean;
  readonly insertFinalNewline?: boolean;
}): Extension =>
  savingRulesField.init(() => ({
    trimTrailingWhitespace: shown.trimTrailingWhitespace === true,
    insertFinalNewline: shown.insertFinalNewline === true,
  }));

const saved = StateEffect.define();

export const sinceSavedField = StateField.define<ChangeSet>({
  create: (state) => ChangeSet.empty(state.doc.length),
  update: (since, transaction) =>
    transaction.effects.some((effect) => effect.is(saved))
      ? ChangeSet.empty(transaction.newDoc.length)
      : transaction.docChanged
        ? since.compose(transaction.changes)
        : since,
});

const trailingSpace = /[ \t]+$/;

function editedLines(state: EditorState, since: ChangeSet): Set<number> {
  const lines = new Set<number>();
  since.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    const last = state.doc.lineAt(toB).number;
    for (let line = state.doc.lineAt(fromB).number; line <= last; line++) {
      lines.add(line);
    }
  });
  return lines;
}

export function savingFixes(state: EditorState): TransactionSpec | undefined {
  const since = state.field(sinceSavedField, false);
  if (since === undefined) {
    return undefined;
  }
  const rules = state.field(savingRulesField, false) ?? noRules;
  const lines = editedLines(state, since);
  const changes: ChangeSpec[] = [];
  if (rules.trimTrailingWhitespace) {
    for (const number of lines) {
      const line = state.doc.line(number);
      const trailing = trailingSpace.exec(line.text);
      if (trailing !== null) {
        changes.push({ from: line.to - trailing[0].length, to: line.to });
      }
    }
  }
  const last = state.doc.line(state.doc.lines);
  if (rules.insertFinalNewline && last.length > 0 && lines.has(last.number)) {
    changes.push({ from: last.to, insert: '\n' });
  }
  return { changes, effects: saved.of(null) };
}
