import { insertBracket } from '@codemirror/autocomplete';
import {
  CharCategory,
  EditorSelection,
  Facet,
  codePointAt,
  codePointSize,
  findClusterBreak,
  type EditorState,
  type SelectionRange,
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

function deleted(
  state: EditorState,
  towards: (range: SelectionRange) => number,
): Transaction | undefined {
  if (state.readOnly) {
    return undefined;
  }
  let userEvent = 'delete.selection';
  const changes = state.changeByRange((range) => {
    let { from, to } = range;
    if (from === to) {
      const reached = towards(range);
      if (reached < from) {
        userEvent = 'delete.backward';
      } else if (reached > from) {
        userEvent = 'delete.forward';
      }
      from = Math.min(from, reached);
      to = Math.max(to, reached);
    }
    return from === to
      ? { range }
      : {
          changes: { from, to },
          range: EditorSelection.cursor(from, from < range.head ? -1 : 1),
        };
  });
  return changes.changes.empty
    ? undefined
    : state.update(changes, { scrollIntoView: true, userEvent });
}

export function characterDeleted(
  state: EditorState,
  forward: boolean,
): Transaction | undefined {
  return deleted(state, ({ head }) => {
    const line = state.doc.lineAt(head);
    const char = head - line.from;
    return (forward ? char >= line.length : char <= 0)
      ? Math.max(0, Math.min(state.doc.length, head + (forward ? 1 : -1)))
      : line.from + findClusterBreak(line.text, char, forward, forward);
  });
}

export function groupDeleted(
  state: EditorState,
  forward: boolean,
): Transaction | undefined {
  return deleted(state, ({ head }) => {
    const line = state.doc.lineAt(head);
    const categorize = state.charCategorizer(head);
    let pos = head;
    let category: CharCategory | undefined;
    while (pos !== (forward ? line.to : line.from)) {
      const next =
        findClusterBreak(line.text, pos - line.from, forward) + line.from;
      const between = line.text.slice(
        Math.min(pos, next) - line.from,
        Math.max(pos, next) - line.from,
      );
      const reached = categorize(between);
      if (category !== undefined && reached !== category) {
        return pos;
      }
      if (between !== ' ' || pos !== head) {
        category = reached;
      }
      pos = next;
    }
    return pos === head && line.number !== (forward ? state.doc.lines : 1)
      ? pos + (forward ? 1 : -1)
      : pos;
  });
}

type Passing = (next: string) => boolean;

const lineBreak = '\n';

function stepped(
  state: EditorState,
  start: SelectionRange,
  forward: boolean,
  by?: (first: string, at: number) => Passing,
): SelectionRange {
  let line = state.doc.lineAt(start.head);
  let reached = start;
  let passing: Passing | undefined;
  for (;;) {
    const char = reached.head - line.from;
    let next: SelectionRange;
    let over: string;
    if (forward ? char >= line.length : char <= 0) {
      if (line.number === (forward ? state.doc.lines : 1)) {
        return reached;
      }
      over = lineBreak;
      line = state.doc.line(line.number + (forward ? 1 : -1));
      next = EditorSelection.cursor(
        forward ? line.from : line.to,
        forward ? 1 : -1,
      );
    } else {
      const to = findClusterBreak(line.text, char, forward);
      over = line.text.slice(Math.min(char, to), Math.max(char, to));
      next = EditorSelection.cursor(line.from + to, forward ? -1 : 1);
    }
    if (passing === undefined) {
      if (by === undefined) {
        return next;
      }
      passing = by(over, start.head);
    } else if (!passing(over)) {
      return reached;
    }
    reached = next;
  }
}

export type Sideways = 'character' | 'group';

export function movedSideways(
  state: EditorState,
  by: Sideways,
  forward: boolean,
  selects: boolean,
): EditorSelection {
  const grouped = (first: string, at: number): Passing => {
    const categorize = state.charCategorizer(at);
    let category = categorize(first);
    return (next) => {
      const reached = categorize(next);
      if (category === CharCategory.Space) {
        category = reached;
      }
      return category === reached;
    };
  };
  const move = (range: SelectionRange) =>
    stepped(state, range, forward, by === 'group' ? grouped : undefined);
  const { selection } = state;
  return EditorSelection.create(
    selection.ranges.map((range) => {
      if (selects) {
        const head = move(range);
        return EditorSelection.range(
          range.anchor,
          head.head,
          undefined,
          undefined,
          head.assoc,
        );
      }
      return range.empty
        ? move(range)
        : EditorSelection.cursor(forward ? range.to : range.from);
    }),
    selection.mainIndex,
  );
}
