import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  history,
  historyField,
  insertNewlineAndIndent,
  redo,
  undo,
} from '@codemirror/commands';
import {
  Compartment,
  EditorState,
  StateEffect,
  type Extension,
} from '@codemirror/state';
import { EditorView, lineNumbers, type ViewUpdate } from '@codemirror/view';
import { strings, type Sentence } from '../../../shared/strings';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { useShell, useShellActions } from '../../../shell/page/store';
import { appSelection } from '../../../ui/editorSelection';
import { appTextLook } from '../../../ui/editorText';
import { WordWrapIcon } from '../../../ui/icons';
import { Words } from '../../../ui/name';
import { keyPressed } from '../../../ui/shortcuts';
import { useCellTable, type CellTable } from '../../../ui/textWidths';
import { editorKeymap } from '../shared/keymap';
import type { CommanderToWebviewOf, TextShown } from '../shared/protocol';
import { colorOfFileNamed } from './fileColors';
import { nameOf, PathTitle } from './pathTitle';
import { useCommander, useCommanderActions } from './store';

export interface EditedTab {
  readonly tab: string;
  readonly file: string;
  readonly version: number | undefined;
  readonly changed: boolean;
  readonly readOnly: boolean;
  readonly made: boolean;
  readonly error: Sentence | undefined;
}

export type ToEditor = CommanderToWebviewOf<'editedText' | 'askOverwrite'>;

const stateKeepDelay = 300;

interface EditorParts {
  readonly table: CellTable;
  readonly readOnly: boolean;
  readonly wrapping: Compartment;
  readonly wordWrap: boolean;
  readonly onSave: () => void;
  readonly onUpdate: (update: ViewUpdate) => void;
}

function keysOf(onSave: () => void): Extension {
  return EditorView.domEventHandlers({
    keydown(event, view) {
      if (keyPressed(editorKeymap.save, event) !== undefined) {
        event.preventDefault();
        onSave();
        return true;
      }
      const command =
        keyPressed(editorKeymap.undo, event) !== undefined
          ? undo
          : keyPressed(editorKeymap.redo, event) !== undefined
            ? redo
            : keyPressed(editorKeymap.newLine, event) !== undefined
              ? insertNewlineAndIndent
              : undefined;
      if (command === undefined) {
        return false;
      }
      event.preventDefault();
      command(view);
      return true;
    },
  });
}

function extensionsOf({
  table,
  readOnly,
  wrapping,
  wordWrap,
  onSave,
  onUpdate,
}: EditorParts): Extension {
  return [
    appTextLook(table),
    appSelection(editorKeymap.rowEnd),
    lineNumbers(),
    history(),
    wrapping.of(wordWrap ? EditorView.lineWrapping : []),
    EditorState.readOnly.of(readOnly),
    EditorView.contentAttributes.of({
      spellcheck: 'false',
      autocorrect: 'off',
      autocapitalize: 'off',
    }),
    keysOf(onSave),
    EditorView.updateListener.of(onUpdate),
  ];
}

function stateOf(
  shown: TextShown,
  kept: unknown,
  extensions: Extension,
): EditorState {
  if (typeof kept === 'object' && kept !== null) {
    try {
      return EditorState.fromJSON(
        { ...kept, doc: shown.text },
        { extensions },
        { history: historyField },
      );
    } catch {
      return EditorState.create({ doc: shown.text, extensions });
    }
  }
  return EditorState.create({ doc: shown.text, extensions });
}

function keptJson(state: EditorState): unknown {
  const json: unknown = state.toJSON({ history: historyField });
  return typeof json === 'object' && json !== null
    ? {
        selection: Reflect.get(json, 'selection'),
        history: Reflect.get(json, 'history'),
      }
    : undefined;
}

export function Editor() {
  const file = useCommander((state) => state.view.editing) ?? '';
  const tab = useCommander((state) => state.view.tab);
  const edited = useCommander((state) =>
    state.edited?.tab === state.view.tab ? state.edited : undefined,
  );
  const fileColor = useCommander((state) =>
    colorOfFileNamed(nameOf(state.view.editing ?? ''), state.view.fileColors),
  );
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const { changeTextView } = useShellActions();
  const {
    listenEditor,
    readEdited,
    editText,
    keepEditState,
    saveText,
    keptEditor,
    keepEditor,
  } = useCommanderActions();
  const table = useCellTable();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const wrapping = useRef(new Compartment());
  const [askingOverwrite, setAskingOverwrite] = useState(false);
  const loaded = edited?.version !== undefined;
  const readOnly = edited?.readOnly === true;
  const startingVersion = useEffectEvent(() => edited?.version ?? 0);
  const wrapsFirst = useEffectEvent(() => wordWrap);

  useEffect(() => {
    if (tab === undefined || !loaded || table === undefined) {
      return undefined;
    }
    const element = host.current;
    if (element === null) {
      return undefined;
    }
    let version = startingVersion();
    let keepTimer: ReturnType<typeof setTimeout> | undefined;
    const keepState = (state: EditorState) => {
      keepEditor(tab, { state, version });
      clearTimeout(keepTimer);
      keepTimer = setTimeout(
        () => keepEditState(tab, version, keptJson(state)),
        stateKeepDelay,
      );
    };
    const extensions = extensionsOf({
      table,
      readOnly,
      wrapping: wrapping.current,
      wordWrap: wrapsFirst(),
      onSave: () => saveText(tab),
      onUpdate: (update) => {
        if (update.docChanged) {
          editText(tab, { version, changes: update.changes.toJSON() });
          version += 1;
        }
        if (update.docChanged || update.selectionSet) {
          keepState(update.state);
        }
      },
    });
    const kept = keptEditor(tab);
    const reused = kept !== undefined && kept.version === version;
    const shown = new EditorView({
      parent: element,
      state: reused
        ? kept.state.update({ effects: StateEffect.reconfigure.of(extensions) })
            .state
        : EditorState.create({ extensions }),
    });
    if (!reused) {
      readEdited(tab);
    }
    view.current = shown;
    const stop = listenEditor((message) => {
      if (message.tab !== tab) {
        return;
      }
      if (message.type === 'askOverwrite') {
        setAskingOverwrite(true);
        return;
      }
      version = message.shown.version;
      shown.setState(stateOf(message.shown, message.state, extensions));
      keepEditor(tab, { state: shown.state, version });
      shown.focus();
    });
    shown.focus();
    return () => {
      stop();
      clearTimeout(keepTimer);
      keepEditor(tab, { state: shown.state, version });
      keepEditState(tab, version, keptJson(shown.state));
      shown.destroy();
      view.current = undefined;
    };
  }, [
    tab,
    loaded,
    table,
    readOnly,
    editText,
    keepEditState,
    keepEditor,
    keptEditor,
    listenEditor,
    readEdited,
    saveText,
  ]);

  useEffect(() => {
    view.current?.dispatch({
      effects: wrapping.current.reconfigure(
        wordWrap ? EditorView.lineWrapping : [],
      ),
    });
  }, [wordWrap]);

  const mark = edited?.readOnly
    ? strings.editor.readOnlyMark
    : edited?.changed
      ? strings.editor.unsaved
      : edited?.made
        ? strings.editor.newFile
        : undefined;

  return (
    <section className="column viewer editor">
      <header className="column-title">
        <div className="column-start nav-buttons viewer-actions">
          <div className="viewer-toggles">
            <button
              className={`nav-button toggle ${wordWrap ? 'active' : ''}`}
              title={strings.common.wrap}
              aria-pressed={wordWrap}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => changeTextView({ wordWrap: !wordWrap })}
            >
              <WordWrapIcon />
            </button>
          </div>
        </div>
      </header>
      <div className="viewer-path editor-path">
        <PathTitle path={file} hidden={[]} color={fileColor} />
        {mark !== undefined && (
          <span
            className={`editor-mark ${edited?.changed ? 'unsaved' : ''}`}
            title={mark}
          >
            {edited?.changed ? strings.symbols.unsaved : mark}
          </span>
        )}
      </div>
      {edited?.error === undefined ? (
        <div className="column-body editor-body" ref={host} />
      ) : (
        <div className="column-body editor-body">
          <div className="viewer-error">
            <Words>{edited.error}</Words>
          </div>
        </div>
      )}
      {askingOverwrite && tab !== undefined && (
        <ConfirmPopup
          title={strings.editor.overwriteTitle}
          message={strings.editor.overwriteAsked}
          lines={strings.editor.overwriteLines(file)}
          confirm={strings.editor.overwrite}
          onConfirm={() => {
            setAskingOverwrite(false);
            saveText(tab, true);
            view.current?.focus();
          }}
          onCancel={() => {
            setAskingOverwrite(false);
            view.current?.focus();
          }}
        />
      )}
    </section>
  );
}
