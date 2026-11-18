import {
  cursorDocEnd,
  cursorDocStart,
  cursorLineDown,
  cursorLineUp,
  selectDocEnd,
  selectDocStart,
  selectLineDown,
  selectLineUp,
} from '@codemirror/commands';
import { EditorSelection, type Extension } from '@codemirror/state';
import { EditorView, type Command } from '@codemirror/view';
import { keyPressed } from '../../../lib/page/shortcuts';
import type { RowFollower } from '../../../lib/page/rowScroll';
import { editorKeymap } from './keymap';

type CursorMove = 'up' | 'down' | 'selectUp' | 'selectDown';

type Follower = (view: EditorView) => RowFollower | undefined;

const byRow: Readonly<Record<CursorMove, Command>> = {
  up: cursorLineUp,
  down: cursorLineDown,
  selectUp: selectLineUp,
  selectDown: selectLineDown,
};

const toFileEnd: Readonly<Record<CursorMove, Command>> = {
  up: cursorDocStart,
  down: cursorDocEnd,
  selectUp: selectDocStart,
  selectDown: selectDocEnd,
};

export function pageRows(viewHeight: number, row: number): number {
  return row > 0 ? Math.max(1, Math.floor(viewHeight / row) - 1) : 1;
}

function shownAt(view: EditorView, top: number): boolean {
  const scroller = view.scrollDOM;
  const cursor = view.coordsAtPos(view.state.selection.main.head);
  if (cursor === null) {
    return false;
  }
  const box = scroller.getBoundingClientRect();
  const above = cursor.top - box.top + scroller.scrollTop - top;
  return (
    above > -1 && above + cursor.bottom - cursor.top < scroller.clientHeight + 1
  );
}

function byPage(move: CursorMove, follower: Follower): Command {
  const forward = move === 'down' || move === 'selectDown';
  const selects = move === 'selectUp' || move === 'selectDown';
  return (view) => {
    const { selection } = view.state;
    const row = view.defaultLineHeight;
    const page = pageRows(view.scrollDOM.clientHeight, row) * row;
    const next = EditorSelection.create(
      selection.ranges.map((range) => {
        const moved = view.moveVertically(range, forward, page - row / 2);
        return selects
          ? EditorSelection.range(
              range.anchor,
              moved.head,
              moved.goalColumn,
              moved.bidiLevel ?? undefined,
              moved.assoc,
            )
          : moved;
      }),
      selection.mainIndex,
    );
    if (next.eq(selection, true)) {
      return true;
    }
    const following = follower(view);
    const kept = following !== undefined && shownAt(view, following.aim());
    view.dispatch({
      selection: next,
      scrollIntoView: !kept,
      userEvent: 'select',
    });
    if (kept) {
      following.scrollTo(following.aim() + (forward ? page : -page), true);
    }
    return true;
  };
}

export function cursorKeys(follower: Follower): Extension {
  const commandOf = (event: KeyboardEvent): Command | undefined => {
    const row = keyPressed(editorKeymap.cursorRow, event);
    if (row !== undefined) {
      return byRow[row];
    }
    const page = keyPressed(editorKeymap.cursorPage, event);
    if (page !== undefined) {
      return byPage(page, follower);
    }
    const end = keyPressed(editorKeymap.cursorFileEnd, event);
    return end === undefined ? undefined : toFileEnd[end];
  };
  return EditorView.domEventHandlers({
    keydown(event, view) {
      const command = commandOf(event);
      if (command === undefined) {
        return false;
      }
      event.preventDefault();
      command(view);
      return true;
    },
  });
}
