import {
  cursorCharLeft,
  cursorCharRight,
  cursorDocEnd,
  cursorDocStart,
  cursorGroupLeft,
  cursorGroupRight,
  selectCharLeft,
  selectCharRight,
  selectDocEnd,
  selectDocStart,
  selectGroupLeft,
  selectGroupRight,
} from '@codemirror/commands';
import {
  EditorSelection,
  type Extension,
  type SelectionRange,
} from '@codemirror/state';
import { EditorView, type Command } from '@codemirror/view';
import { keyPressed } from '../../../lib/page/shortcuts';
import type { RowFollower } from '../../../lib/page/rowScroll';
import { editorKeymap } from './keymap';
import { cellAt, gridOf, type Grid } from './grid';
import { extended, movedRows, rowStart } from './gridMoves';

type CursorMove = 'up' | 'down' | 'selectUp' | 'selectDown';

type SidewaysMove = 'left' | 'right' | 'selectLeft' | 'selectRight';

type Follower = (view: EditorView) => RowFollower | undefined;

function moved(
  view: EditorView,
  selects: boolean,
  move: (range: SelectionRange, grid: Grid) => SelectionRange,
): boolean {
  const grid = gridOf(view);
  if (grid === undefined) {
    return true;
  }
  const { selection } = view.state;
  const next = EditorSelection.create(
    selection.ranges.map((range) => {
      const reached = move(range, grid);
      return selects ? extended(range, reached) : reached;
    }),
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

const forwards = (move: CursorMove) => move === 'down' || move === 'selectDown';

const selecting = (move: CursorMove) =>
  move === 'selectUp' || move === 'selectDown';

const byRow =
  (move: CursorMove): Command =>
  (view) =>
    moved(view, selecting(move), (range, grid) =>
      !selecting(move) && !range.empty
        ? EditorSelection.cursor(forwards(move) ? range.to : range.from)
        : movedRows(view.state.doc, grid, range, forwards(move) ? 1 : -1),
    );

const byCharacter: Readonly<Record<SidewaysMove, Command>> = {
  left: cursorCharLeft,
  right: cursorCharRight,
  selectLeft: selectCharLeft,
  selectRight: selectCharRight,
};

const byWord: Readonly<Record<SidewaysMove, Command>> = {
  left: cursorGroupLeft,
  right: cursorGroupRight,
  selectLeft: selectGroupLeft,
  selectRight: selectGroupRight,
};

const toRowStart =
  (how: 'move' | 'select'): Command =>
  (view) =>
    moved(view, how === 'select', (range, grid) =>
      rowStart(view.state.doc, grid, range),
    );

const toFileEnd: Readonly<Record<CursorMove, Command>> = {
  up: cursorDocStart,
  down: cursorDocEnd,
  selectUp: selectDocStart,
  selectDown: selectDocEnd,
};

export function pageRows(viewHeight: number, row: number): number {
  return row > 0 ? Math.max(1, Math.floor(viewHeight / row) - 1) : 1;
}

function shownAt(view: EditorView, grid: Grid, top: number): boolean {
  const scroller = view.scrollDOM;
  const { main } = view.state.selection;
  const cursor = cellAt(view, grid, main.head, main.assoc || 1);
  const box = scroller.getBoundingClientRect();
  const above = cursor.top - box.top + scroller.scrollTop - top;
  return above > -1 && above + cursor.height < scroller.clientHeight + 1;
}

function byPage(move: CursorMove, follower: Follower): Command {
  const forward = forwards(move);
  const selects = selecting(move);
  return (view) => {
    const grid = gridOf(view);
    if (grid === undefined) {
      return true;
    }
    const { selection } = view.state;
    const rows = pageRows(view.scrollDOM.clientHeight, grid.rowHeight);
    const page = rows * grid.rowHeight;
    const next = EditorSelection.create(
      selection.ranges.map((range) => {
        const reached = movedRows(
          view.state.doc,
          grid,
          range,
          forward ? rows : -rows,
        );
        return selects ? extended(range, reached) : reached;
      }),
      selection.mainIndex,
    );
    if (next.eq(selection, true)) {
      return true;
    }
    const following = follower(view);
    const kept =
      following !== undefined && shownAt(view, grid, following.aim());
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
    const character = keyPressed(editorKeymap.cursorCharacter, event);
    if (character !== undefined) {
      return byCharacter[character];
    }
    const word = keyPressed(editorKeymap.cursorWord, event);
    if (word !== undefined) {
      return byWord[word];
    }
    const start = keyPressed(editorKeymap.rowStart, event);
    if (start !== undefined) {
      return toRowStart(start);
    }
    const row = keyPressed(editorKeymap.cursorRow, event);
    if (row !== undefined) {
      return byRow(row);
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
