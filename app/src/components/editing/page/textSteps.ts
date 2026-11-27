import { clusterBreak } from '../../../lib/page/graphemes';
import { characterKind } from '../../../lib/shared/textMatches';
import { wordAt } from '../../cells/page/textSelection';
import {
  EditorSelection,
  findClusterBreak,
  type EditorState,
  type SelectionRange,
  type Transaction,
} from '@codemirror/state';

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
      : line.from +
          (forward
            ? clusterBreak(line.text, char, true)
            : Math.max(
                clusterBreak(line.text, char, false),
                findClusterBreak(line.text, char, false, false),
              ));
  });
}

export function groupDeleted(
  state: EditorState,
  forward: boolean,
): Transaction | undefined {
  return deleted(state, ({ head }) => {
    const line = state.doc.lineAt(head);
    let pos = head;
    let category: string | undefined;
    while (pos !== (forward ? line.to : line.from)) {
      const next =
        clusterBreak(line.text, pos - line.from, forward) + line.from;
      const between = line.text.slice(
        Math.min(pos, next) - line.from,
        Math.max(pos, next) - line.from,
      );
      const reached = characterKind(between);
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
  by?: (first: string) => Passing,
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
      const to = clusterBreak(line.text, char, forward);
      over = line.text.slice(Math.min(char, to), Math.max(char, to));
      next = EditorSelection.cursor(line.from + to, forward ? -1 : 1);
    }
    if (passing === undefined) {
      if (by === undefined) {
        return next;
      }
      passing = by(over);
    } else if (!passing(over)) {
      return reached;
    }
    reached = next;
  }
}

export type Sideways = 'character' | 'group';

function grouped(first: string): Passing {
  let category = characterKind(first);
  return (next) => {
    const reached = characterKind(next);
    if (category === 'space') {
      category = reached;
    }
    return category === reached;
  };
}

export function movedSideways(
  state: EditorState,
  by: Sideways,
  forward: boolean,
  selects: boolean,
): EditorSelection {
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

export function wordRangeAt(state: EditorState, pos: number): SelectionRange {
  const line = state.doc.lineAt(pos);
  const { anchor, focus } = wordAt(
    { start: 0, text: line.text },
    pos - line.from,
  );
  return EditorSelection.range(line.from + anchor.char, line.from + focus.char);
}
