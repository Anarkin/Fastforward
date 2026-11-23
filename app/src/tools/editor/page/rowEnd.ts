import {
  EditorSelection,
  Prec,
  type Extension,
  type SelectionRange,
} from '@codemirror/state';
import { surfaceEvents, type EditorSurface } from './surface';
import type { Binding } from '../../../lib/shared/keymap';
import { keyPressed } from '../../../lib/page/shortcuts';
import { gridOf } from './grid';
import { extended, rowEnd } from './gridMoves';

function moved(
  view: EditorSurface,
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

function toRowEnd(view: EditorSurface, how: RowEnd): boolean {
  const grid = gridOf(view);
  return (
    grid === undefined ||
    moved(view, (range) => {
      const end = rowEnd(view.state.doc, grid, range);
      return how === 'move' ? end : extended(range, end);
    })
  );
}

export function rowEndKeys(binding: Binding<RowEnd>): Extension {
  return Prec.high(
    surfaceEvents({
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
