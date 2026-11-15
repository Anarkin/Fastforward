import {
  EditorSelection,
  Prec,
  type Extension,
  type SelectionRange,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Binding } from '../../../lib/shared/keymap';
import { keyPressed } from '../../../lib/page/shortcuts';

const hangingBlank = /[ \t　]/;

function rowEnd(view: EditorView, start: SelectionRange): SelectionRange {
  const end = view.moveToLineBoundary(start, true);
  if (!view.lineWrapping) {
    return end;
  }
  const line = view.state.doc.lineAt(end.head);
  let after = end.head;
  while (after < line.to && hangingBlank.test(line.text[after - line.from])) {
    after++;
  }
  if (after === end.head) {
    return end;
  }
  if (after === line.to) {
    return EditorSelection.cursor(after, -1);
  }
  const here = view.coordsAtPos(end.head, -1);
  const next = view.coordsAtPos(after, 1);
  return here !== null &&
    next !== null &&
    next.top > (here.top + here.bottom) / 2
    ? EditorSelection.cursor(after, -1)
    : end;
}

function moved(
  view: EditorView,
  move: (range: SelectionRange) => SelectionRange,
): boolean {
  const { selection } = view.state;
  const next = EditorSelection.create(
    selection.ranges.map(move),
    selection.mainIndex,
  );
  if (!next.eq(selection, true)) {
    view.dispatch({
      selection: next,
      scrollIntoView: true,
      userEvent: 'select',
    });
  }
  return true;
}

export type RowEnd = 'move' | 'select';

function toRowEnd(view: EditorView, how: RowEnd): boolean {
  return moved(view, (range) => {
    const end = rowEnd(view, range);
    return how === 'move'
      ? end
      : EditorSelection.range(
          range.anchor,
          end.head,
          end.goalColumn,
          end.bidiLevel ?? undefined,
          end.assoc,
        );
  });
}

export function rowEndKeys(binding: Binding<RowEnd>): Extension {
  return Prec.high(
    EditorView.domEventHandlers({
      keydown(event, view) {
        const how = keyPressed(binding, event);
        if (how === undefined) {
          return false;
        }
        event.preventDefault();
        return toRowEnd(view, how);
      },
    }),
  );
}
