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
  StateField,
  type Extension,
  type Text,
} from '@codemirror/state';
import {
  EditorView,
  rectangularSelection,
  type Command,
} from '@codemirror/view';
import { clicked } from '../../../shell/shared/keymap';
import { keyPressed } from '../../../ui/shortcuts';
import { editorKeymap } from '../shared/keymap';

interface CommentTokens {
  readonly line?: string;
  readonly block?: { readonly open: string; readonly close: string };
}

const slashes: CommentTokens = {
  line: '//',
  block: { open: '/*', close: '*/' },
};
const hashes: CommentTokens = { line: '#' };
const markup: CommentTokens = { block: { open: '<!--', close: '-->' } };
const dashes: CommentTokens = { line: '--' };
const semicolons: CommentTokens = { line: ';' };
const percents: CommentTokens = { line: '%' };
const parentheses = { open: '(*', close: '*)' };

const commentTokens: Readonly<Record<string, CommentTokens>> = {
  javascript: slashes,
  typescript: slashes,
  tsx: slashes,
  jsx: slashes,
  jsonc: slashes,
  json5: slashes,
  c: slashes,
  cpp: slashes,
  csharp: slashes,
  java: slashes,
  go: slashes,
  rust: slashes,
  swift: slashes,
  kotlin: slashes,
  scala: slashes,
  php: slashes,
  dart: slashes,
  groovy: slashes,
  'objective-c': slashes,
  scss: slashes,
  less: slashes,
  zig: slashes,
  css: { block: { open: '/*', close: '*/' } },
  html: markup,
  xml: markup,
  markdown: markup,
  vue: markup,
  svelte: markup,
  python: hashes,
  ruby: hashes,
  shellscript: hashes,
  yaml: hashes,
  toml: hashes,
  perl: hashes,
  r: hashes,
  make: hashes,
  docker: hashes,
  cmake: hashes,
  elixir: hashes,
  julia: hashes,
  nix: hashes,
  powershell: { line: '#', block: { open: '<#', close: '#>' } },
  ini: semicolons,
  clojure: semicolons,
  lisp: semicolons,
  sql: { line: '--', block: { open: '/*', close: '*/' } },
  lua: { line: '--', block: { open: '--[[', close: ']]' } },
  haskell: { line: '--', block: { open: '{-', close: '-}' } },
  ada: dashes,
  bat: { line: 'REM' },
  fsharp: { line: '//', block: parentheses },
  ocaml: { block: parentheses },
  vb: { line: "'" },
  erlang: percents,
  latex: percents,
  matlab: percents,
};

export function commentsOf(language: string | undefined): Extension {
  const tokens = language === undefined ? undefined : commentTokens[language];
  return tokens === undefined
    ? []
    : EditorState.languageData.of(() => [{ commentTokens: tokens }]);
}

const leadPattern = /^[ \t]*/;
const scannedLines = 10_000;

export function detectedIndent(doc: Text, tabSize = 4): string {
  let tabbed = 0;
  let spaced = 0;
  let previous = 0;
  const steps = new Map<number, number>();
  for (let number = 1; number <= Math.min(doc.lines, scannedLines); number++) {
    const { text } = doc.line(number);
    const lead = leadPattern.exec(text)?.[0] ?? '';
    if (lead.length === text.length) {
      continue;
    }
    if (lead.startsWith('\t')) {
      tabbed += 1;
      continue;
    }
    if (lead.length > 0) {
      spaced += 1;
    }
    const step = Math.abs(lead.length - previous);
    if (step >= 2 && step <= 8) {
      steps.set(step, (steps.get(step) ?? 0) + 1);
    }
    previous = lead.length;
  }
  if (tabbed > spaced) {
    return '\t';
  }
  const [mostUsed] = [...steps].toSorted(
    ([stepA, countA], [stepB, countB]) => countB - countA || stepA - stepB,
  );
  return ' '.repeat(mostUsed?.[0] ?? tabSize);
}

export const indentField = StateField.define<string>({
  create: () => ' '.repeat(4),
  update: (unit) => unit,
  provide: (field) => indentUnit.from(field),
});

export function indentionOf(doc: Text): Extension {
  return indentField.init(() => detectedIndent(doc));
}

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
    if (keyPressed(editorKeymap.singleCursor, event) !== undefined) {
      return (view) => {
        if (simplifySelection(view)) {
          return true;
        }
        tabLeavesUntil = Date.now() + tabLeavesFor;
        return false;
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
