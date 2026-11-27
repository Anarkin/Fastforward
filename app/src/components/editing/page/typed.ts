import { insertBracket } from '@codemirror/autocomplete';
import {
  EditorSelection,
  Facet,
  codePointAt,
  codePointSize,
  type EditorState,
  type Text,
  type Transaction,
  type TransactionSpec,
} from '@codemirror/state';

export const bracketsClose = Facet.define<boolean, boolean>({
  combine: (closing) => closing.some((each) => each),
});

export interface TextChange {
  readonly from: number;
  readonly to: number;
  readonly insert: Text;
}

export type Composing = 'started' | 'going';

function bracketTyped(
  state: EditorState,
  { from, to, insert }: TextChange,
): Transaction | undefined {
  const { main } = state.selection;
  const text = insert.toString();
  if (
    !state.facet(bracketsClose) ||
    text.length > 2 ||
    (text.length === 2 && codePointSize(codePointAt(text, 0)) === 1) ||
    from !== main.from ||
    to !== main.to
  ) {
    return undefined;
  }
  return insertBracket(state, text) ?? undefined;
}

export function typed(
  state: EditorState,
  change: TextChange,
  selection: EditorSelection | undefined,
  composing: Composing | undefined,
): Transaction {
  const bracket =
    composing === undefined ? bracketTyped(state, change) : undefined;
  if (bracket !== undefined) {
    return bracket;
  }
  const { main } = state.selection;
  const within =
    change.from >= main.from &&
    change.to <= main.to &&
    change.to - change.from >= (main.to - main.from) / 3;
  const endsTyped =
    selection === undefined ||
    (selection.main.empty &&
      selection.main.from === change.from + change.insert.length);
  let spec: TransactionSpec;
  if (within && endsTyped && composing === undefined) {
    const before =
      main.from < change.from ? state.sliceDoc(main.from, change.from) : '';
    const after = main.to > change.to ? state.sliceDoc(change.to, main.to) : '';
    spec = state.replaceSelection(
      state.toText(
        before +
          change.insert.sliceString(0, undefined, state.lineBreak) +
          after,
      ),
    );
  } else {
    const changes = state.changes(change);
    const reached =
      selection !== undefined && selection.main.to <= changes.newLength
        ? selection.main
        : undefined;
    spec = {
      changes,
      selection: reached && state.selection.replaceRange(reached),
    };
  }
  return state.update(spec, {
    userEvent:
      composing === undefined
        ? 'input.type'
        : composing === 'started'
          ? 'input.type.compose.start'
          : 'input.type.compose',
    scrollIntoView: true,
  });
}
