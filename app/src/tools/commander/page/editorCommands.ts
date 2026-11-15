import {
  addCursorAbove,
  addCursorBelow,
  indentLess,
  indentMore,
  insertNewlineAndIndent,
  moveLineDown,
  moveLineUp,
  redo,
  simplifySelection,
  toggleComment,
  undo,
} from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import {
  EditorSelection,
  EditorState,
  type Extension,
} from '@codemirror/state';
import {
  EditorView,
  rectangularSelection,
  type Command,
} from '@codemirror/view';
import { clicked } from '../../../lib/shared/keymap';
import { keyPressed } from '../../../lib/page/shortcuts';
import { editorKeymap } from './editorKeymap';

const indentOrInsert: Command = (view) => {
  const { state } = view;
  if (state.selection.ranges.some((range) => !range.empty)) {
    return indentMore(view);
  }
  const unit = state.facet(indentUnit);
  view.dispatch(
    state.changeByRange((range) => {
      const line = state.doc.lineAt(range.head);
      const column = range.head - line.from;
      const inserted =
        unit === '\t' ? '\t' : ' '.repeat(unit.length - (column % unit.length));
      return {
        changes: { from: range.head, insert: inserted },
        range: EditorSelection.cursor(range.head + inserted.length),
      };
    }),
    { userEvent: 'input.indent', scrollIntoView: true },
  );
  return true;
};

const selectNextOccurrence: Command = (view) => {
  const { state } = view;
  const { main } = state.selection;
  if (main.empty) {
    const word = state.wordAt(main.head);
    if (word === null) {
      return false;
    }
    view.dispatch({
      selection: state.selection.replaceRange(
        EditorSelection.range(word.from, word.to),
      ),
    });
    return true;
  }
  const searched = state.sliceDoc(main.from, main.to);
  const text = state.doc.toString();
  const last = Math.max(...state.selection.ranges.map((range) => range.to));
  const taken = (at: number) =>
    state.selection.ranges.some((range) => range.from === at);
  let found = text.indexOf(searched, last);
  if (found === -1 || taken(found)) {
    found = text.indexOf(searched);
  }
  while (found !== -1 && taken(found)) {
    found = text.indexOf(searched, found + 1);
  }
  if (found === -1) {
    return false;
  }
  view.dispatch({
    selection: state.selection.addRange(
      EditorSelection.range(found, found + searched.length),
    ),
    scrollIntoView: true,
  });
  return true;
};

export interface EditorKeyActions {
  readonly save: () => void;
  readonly find: () => void;
  readonly replace: () => void;
  readonly goToLine: () => void;
  readonly close: () => void;
}

export function escapeCloses(selection: EditorSelection): boolean {
  return selection.ranges.length === 1 && selection.main.empty;
}

const tabLeavesFor = 2000;

export function editorKeys(actions: EditorKeyActions): Extension {
  let tabLeavesUntil = 0;
  const commandOf = (event: KeyboardEvent): Command | undefined => {
    const indent = keyPressed(editorKeymap.indent, event);
    if (indent !== undefined) {
      return Date.now() < tabLeavesUntil
        ? undefined
        : indent > 0
          ? indentOrInsert
          : indentLess;
    }
    const moved = keyPressed(editorKeymap.moveLines, event);
    if (moved !== undefined) {
      return moved < 0 ? moveLineUp : moveLineDown;
    }
    const rows = keyPressed(editorKeymap.cursorRows, event);
    if (rows !== undefined) {
      return rows < 0 ? addCursorAbove : addCursorBelow;
    }
    if (keyPressed(editorKeymap.undo, event) !== undefined) {
      return undo;
    }
    if (keyPressed(editorKeymap.redo, event) !== undefined) {
      return redo;
    }
    if (keyPressed(editorKeymap.newLine, event) !== undefined) {
      return insertNewlineAndIndent;
    }
    if (keyPressed(editorKeymap.comment, event) !== undefined) {
      return toggleComment;
    }
    if (keyPressed(editorKeymap.nextOccurrence, event) !== undefined) {
      return selectNextOccurrence;
    }
    if (keyPressed(editorKeymap.tabLeaves, event) !== undefined) {
      return () => {
        tabLeavesUntil = Date.now() + tabLeavesFor;
        return true;
      };
    }
    const dropping = keyPressed(editorKeymap.singleCursor, event) !== undefined;
    const closing = keyPressed(editorKeymap.closeEditor, event) !== undefined;
    if (dropping || closing) {
      return (view) => {
        if (!escapeCloses(view.state.selection)) {
          return dropping && simplifySelection(view);
        }
        if (closing) {
          actions.close();
        }
        return closing;
      };
    }
    const action =
      keyPressed(editorKeymap.save, event) !== undefined
        ? actions.save
        : keyPressed(editorKeymap.find, event) !== undefined
          ? actions.find
          : keyPressed(editorKeymap.replace, event) !== undefined
            ? actions.replace
            : keyPressed(editorKeymap.goToLine, event) !== undefined
              ? actions.goToLine
              : undefined;
    return action === undefined
      ? undefined
      : () => {
          action();
          return true;
        };
  };
  return [
    EditorState.allowMultipleSelections.of(true),
    EditorView.clickAddsSelectionRange.of(
      (event) => clicked(editorKeymap.addCursor, event) !== undefined,
    ),
    rectangularSelection({
      eventFilter: (event) =>
        clicked(editorKeymap.columnSelection, event) !== undefined,
    }),
    EditorView.domEventHandlers({
      keydown(event, view) {
        const command = commandOf(event);
        if (command === undefined || !command(view)) {
          return false;
        }
        event.preventDefault();
        return true;
      },
    }),
  ];
}
