import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { history, historyField } from '@codemirror/commands';
import {
  Compartment,
  EditorSelection,
  EditorState,
  StateEffect,
  Text,
  type Extension,
} from '@codemirror/state';
import { EditorView, lineNumbers, type ViewUpdate } from '@codemirror/view';
import { strings, type Sentence } from '../../../shared/strings';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { useShell, useShellActions } from '../../../shell/page/store';
import { syntaxColors } from '../../../ui/editorColors';
import { appSelection } from '../../../ui/editorSelection';
import { appTextLook } from '../../../ui/editorText';
import { WordWrapIcon } from '../../../ui/icons';
import { Words } from '../../../ui/name';
import { languageOf } from '../../../ui/languages';
import { colorer, startColorer } from '../../../ui/syntax';
import {
  cellWidthsOf,
  columnsOf,
  useCellTable,
  type CellTable,
} from '../../../ui/textWidths';
import { StatusLine } from '../../../ui/statusLine';
import { PromptPopup } from '../../../shell/page/promptPopup';
import {
  commentsOf,
  editorKeys,
  indentField,
  indentionOf,
  type EditorKeyActions,
} from './editorCommands';
import { editorKeymap } from '../shared/keymap';
import {
  maxColoredBytes,
  textEncodings,
  type CommanderToWebviewOf,
  type TextEncoding,
  type TextShown,
} from '../shared/protocol';
import {
  convertedTo,
  endingCounts,
  endingsChanged,
  endingsField,
  endingsFrom,
  endingsSent,
  endingsUndone,
} from './editorEndings';
import { colorOfFileNamed } from './fileColors';
import { viewerChoices } from './view';
import type { LineEnding } from '../shared/textMarks';
import { MenuButton } from '../../../ui/menu';
import type { ContextMenuItem } from '../../../ui/contextMenu';
import {
  LanguageButton,
  languageChoiceOf,
  shownLanguage,
} from '../../../ui/languageChoice';
import { nameOf, PathTitle } from './pathTitle';
import { useCommander, useCommanderActions } from './store';

export interface EditedTab {
  readonly tab: string;
  readonly file: string;
  readonly version: number | undefined;
  readonly encoding: TextEncoding | undefined;
  readonly bom: boolean;
  readonly readAs: TextEncoding | undefined;
  readonly changed: boolean;
  readonly readOnly: boolean;
  readonly made: boolean;
  readonly error: Sentence | undefined;
}

export type ToEditor = CommanderToWebviewOf<
  'editedText' | 'askOverwrite' | 'askChangedOnDisk'
>;

const stateKeepDelay = 300;

interface EditorParts {
  readonly table: CellTable;
  readonly readOnly: boolean;
  readonly wrapping: Compartment;
  readonly wordWrap: boolean;
  readonly coloring: Compartment;
  readonly colors: Extension;
  readonly keys: EditorKeyActions;
  readonly onUpdate: (update: ViewUpdate) => void;
}

function extensionsOf({
  table,
  readOnly,
  wrapping,
  wordWrap,
  coloring,
  colors,
  keys,
  onUpdate,
}: EditorParts): Extension {
  return [
    coloring.of(colors),
    appTextLook(table),
    appSelection(editorKeymap.rowEnd),
    lineNumbers(),
    history(),
    endingsUndone,
    wrapping.of(wordWrap ? EditorView.lineWrapping : []),
    EditorState.readOnly.of(readOnly),
    EditorView.contentAttributes.of({
      spellcheck: 'false',
      autocorrect: 'off',
      autocapitalize: 'off',
    }),
    editorKeys(keys),
    EditorView.updateListener.of(onUpdate),
  ];
}

function stateOf(
  shown: TextShown,
  kept: unknown,
  extensions: Extension,
): EditorState {
  const doc = Text.of(shown.text.split(lineBreak));
  const all = [extensions, endingsFrom(doc, shown), indentionOf(doc)];
  if (typeof kept === 'object' && kept !== null) {
    try {
      return EditorState.fromJSON(
        { ...kept, doc: shown.text },
        { extensions: all },
        { history: historyField },
      );
    } catch {
      return EditorState.create({ doc, extensions: all });
    }
  }
  return EditorState.create({ doc, extensions: all });
}

const lineBreak = String.fromCharCode(10);

interface EndingsShown {
  readonly ending: LineEnding;
  readonly counts: Readonly<Record<LineEnding, number>>;
}

const endingOrder: readonly LineEnding[] = ['lf', 'crlf', 'cr'];

function endingsShownOf(state: EditorState): EndingsShown {
  return {
    ending: state.field(endingsField).ending,
    counts: endingCounts(state),
  };
}

function endingsLabel({ ending, counts }: EndingsShown): string {
  const used = endingOrder.filter((each) => counts[each] > 0);
  return used.length > 1
    ? strings.editor.mixed
    : strings.editor.endingNames[used[0] ?? ending];
}

function endingsTitle({ ending, counts }: EndingsShown): string {
  return strings.editor.endingCounts(
    endingOrder
      .filter((each) => counts[each] > 0)
      .map((each) =>
        strings.editor.linesEndingIn(
          counts[each],
          strings.editor.endingNames[each],
        ),
      ),
    strings.editor.endingNames[ending],
  );
}

const encodingName = (encoding: TextEncoding) =>
  strings.commander.encodingShort[encoding];

function keptJson(state: EditorState): unknown {
  const json: unknown = state.toJSON({ history: historyField });
  return typeof json === 'object' && json !== null
    ? {
        selection: Reflect.get(json, 'selection'),
        history: Reflect.get(json, 'history'),
      }
    : undefined;
}

const colorsOf = (language: string | undefined, on: boolean): Extension => [
  on ? syntaxColors(language, colorer, maxColoredBytes) : [],
  commentsOf(language),
];

const fieldsKept = [endingsField, indentField];

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const countedCharacters = 1_000_000;

function charactersIn(text: string): number {
  return text.length > countedCharacters
    ? text.length
    : [...graphemes.segment(text)].length;
}

function statusOf(state: EditorState, table: CellTable): string {
  const { main, ranges } = state.selection;
  const line = state.doc.lineAt(main.head);
  const column =
    columnsOf(line.text, cellWidthsOf(table))(main.head - line.from) + 1;
  const parts = [strings.editor.position(line.number, column)];
  if (ranges.length > 1) {
    parts.push(strings.editor.cursors(ranges.length));
  } else if (!main.empty) {
    parts.push(
      strings.editor.selected(
        state.doc.lineAt(main.to).number -
          state.doc.lineAt(main.from).number +
          1,
        charactersIn(state.sliceDoc(main.from, main.to)),
      ),
    );
  }
  return parts.join(strings.editor.between);
}

export function Editor() {
  useEffect(startColorer, []);
  const file = useCommander((state) => state.view.editing) ?? '';
  const tab = useCommander((state) => state.view.tab);
  const edited = useCommander((state) =>
    state.edited?.tab === state.view.tab ? state.edited : undefined,
  );
  const fileColor = useCommander((state) =>
    colorOfFileNamed(nameOf(state.view.editing ?? ''), state.view.fileColors),
  );
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const { changeTextView } = useShellActions();
  const choices = useCommander((state) => viewerChoices(state.view));
  const { choose: onChoose } = useCommanderActions();
  const { choice: languageChoice, choose: chooseLanguage } = languageChoiceOf(
    file,
    {
      on: highlightSyntax,
      change: (on) => changeTextView({ highlightSyntax: on }),
    },
    {
      language: choices.language,
      keep: (chosen) => onChoose({ language: chosen }),
    },
  );
  const detectedLanguage = languageOf(file);
  const language = shownLanguage(languageChoice, detectedLanguage);
  const {
    listenEditor,
    readEdited,
    editText,
    keepEditState,
    saveText,
    reloadEdited,
    saveIn,
    reopenIn,
    keptEditor,
    keepEditor,
  } = useCommanderActions();
  const [endingsShown, setEndingsShown] = useState<EndingsShown | undefined>();
  const [reopening, setReopening] = useState<TextEncoding | 'auto'>();
  const [status, setStatus] = useState<string>();
  const [goingToLine, setGoingToLine] = useState(false);
  const [lineCount, setLineCount] = useState(0);
  const table = useCellTable();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const wrapping = useRef(new Compartment());
  const coloring = useRef(new Compartment());
  const [askingOverwrite, setAskingOverwrite] = useState(false);
  const [askingChanged, setAskingChanged] = useState(false);
  const loaded = edited?.version !== undefined;
  const readOnly = edited?.readOnly === true;
  const startingVersion = useEffectEvent(() => edited?.version ?? 0);
  const wrapsFirst = useEffectEvent(() => wordWrap);
  const colorsFirst = useEffectEvent(() => colorsOf(language, highlightSyntax));

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
      coloring: coloring.current,
      colors: colorsFirst(),
      keys: {
        save: () => saveText(tab),
        find: () => {},
        replace: () => {},
        goToLine: () => {
          setLineCount(shown.state.doc.lines);
          setGoingToLine(true);
        },
      },
      onUpdate: (update) => {
        const converted = endingsChanged(update.transactions);
        if (update.docChanged || converted) {
          editText(tab, {
            version,
            ...(update.docChanged && { changes: update.changes.toJSON() }),
            ...(converted && {
              endings: endingsSent(update.state.field(endingsField)),
            }),
          });
          version += 1;
          setEndingsShown(endingsShownOf(update.state));
        }
        if (update.docChanged || update.selectionSet) {
          keepState(update.state);
          setStatus(statusOf(update.state, table));
        }
      },
    });
    const kept = keptEditor(tab);
    const reused = kept !== undefined && kept.version === version;
    const shown = new EditorView({
      parent: element,
      state: reused
        ? kept.state.update({
            effects: StateEffect.reconfigure.of([extensions, fieldsKept]),
          }).state
        : EditorState.create({ extensions: [extensions, fieldsKept] }),
    });
    setStatus(reused ? statusOf(shown.state, table) : undefined);
    setEndingsShown(reused ? endingsShownOf(shown.state) : undefined);
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
      if (message.type === 'askChangedOnDisk') {
        setAskingChanged(true);
        return;
      }
      const head = shown.state.selection.main.head;
      version = message.shown.version;
      shown.setState(stateOf(message.shown, message.state, extensions));
      if (message.reloaded === true) {
        shown.dispatch({
          selection: EditorSelection.cursor(
            Math.min(head, shown.state.doc.length),
          ),
          scrollIntoView: true,
        });
      }
      keepEditor(tab, { state: shown.state, version });
      setEndingsShown(endingsShownOf(shown.state));
      setStatus(statusOf(shown.state, table));
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

  useEffect(() => {
    view.current?.dispatch({
      effects: coloring.current.reconfigure(
        colorsOf(language, highlightSyntax),
      ),
    });
  }, [language, highlightSyntax]);

  const encoding = edited?.encoding;
  const encodingLabel =
    encoding === undefined
      ? undefined
      : edited?.bom === true
        ? strings.editor.withBom(encodingName(encoding))
        : encodingName(encoding);
  const reopen = (chosen: TextEncoding | 'auto') => {
    if (tab === undefined) {
      return;
    }
    if (edited?.changed === true) {
      setReopening(chosen);
    } else {
      reopenIn(tab, chosen);
    }
  };
  const encodingItems: readonly ContextMenuItem[] =
    tab === undefined || encoding === undefined
      ? []
      : [
          { label: strings.editor.saveIn, disabled: true },
          ...textEncodings.flatMap((each) =>
            (each === 'utf-8'
              ? [false, true]
              : [each.startsWith('utf-16')]
            ).map((bom) => ({
              label:
                bom && each === 'utf-8'
                  ? strings.editor.withBom(encodingName(each))
                  : encodingName(each),
              keywords: strings.editor.saveIn,
              checked: each === encoding && bom === edited?.bom,
              onClick: () => saveIn(tab, each, bom),
            })),
          ),
          { separator: true },
          { label: strings.editor.reopenIn, disabled: true },
          {
            label: strings.common.auto,
            keywords: strings.editor.reopenIn,
            onClick: () => reopen('auto'),
          },
          ...textEncodings.map((each) => ({
            label: encodingName(each),
            keywords: strings.editor.reopenIn,
            checked: each === (edited?.readAs ?? encoding),
            onClick: () => reopen(each),
          })),
        ];
  const convert = (ending: LineEnding) =>
    view.current?.dispatch(convertedTo(ending));

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
          {encodingLabel !== undefined && !readOnly && (
            <div className="viewer-encoding">
              <MenuButton
                title={strings.editor.encodingTitle}
                label={
                  edited?.readAs === undefined
                    ? encodingLabel
                    : strings.editor.savedAs(
                        encodingName(edited.readAs),
                        encodingLabel,
                      )
                }
                filter={strings.common.findEncoding}
                items={encodingItems}
                onChosen={() => view.current?.focus()}
              />
            </div>
          )}
          {endingsShown !== undefined && !readOnly && (
            <div className="viewer-encoding">
              <MenuButton
                title={endingsTitle(endingsShown)}
                label={endingsLabel(endingsShown)}
                items={(['lf', 'crlf'] as const).map((ending) => ({
                  label: strings.editor.convertTo(
                    strings.editor.endingNames[ending],
                  ),
                  checked:
                    endingsLabel(endingsShown) ===
                    strings.editor.endingNames[ending],
                  onClick: () => convert(ending),
                }))}
                onChosen={() => view.current?.focus()}
              />
            </div>
          )}
          <LanguageButton
            choice={languageChoice}
            detected={detectedLanguage}
            single
            choose={chooseLanguage}
            onChosen={() => view.current?.focus()}
          />
          <span className="nav-button-space" />
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
        <>
          <div className="column-body editor-body" ref={host} />
          {status !== undefined && <StatusLine>{status}</StatusLine>}
        </>
      ) : (
        <div className="column-body editor-body">
          <div className="viewer-error">
            <Words>{edited.error}</Words>
          </div>
        </div>
      )}
      {goingToLine && (
        <PromptPopup
          title={strings.editor.goToLineTitle}
          label={strings.editor.lineNumber(lineCount)}
          confirm={strings.editor.goToLine}
          problemOf={(typed) =>
            /^\d+$/.test(typed) &&
            Number(typed) >= 1 &&
            Number(typed) <= lineCount
              ? undefined
              : strings.editor.noSuchLine(lineCount)
          }
          onConfirm={(typed) => {
            setGoingToLine(false);
            const shown = view.current;
            if (shown !== undefined) {
              const { from } = shown.state.doc.line(Number(typed));
              shown.dispatch({
                selection: { anchor: from },
                scrollIntoView: true,
              });
              shown.focus();
            }
          }}
          onCancel={() => {
            setGoingToLine(false);
            view.current?.focus();
          }}
        />
      )}
      {reopening !== undefined && tab !== undefined && (
        <ConfirmPopup
          title={strings.editor.reopenTitle}
          message={strings.editor.reopenAsked}
          lines={strings.editor.overwriteLines(file)}
          confirm={strings.editor.reopen}
          onConfirm={() => {
            setReopening(undefined);
            reopenIn(tab, reopening);
            view.current?.focus();
          }}
          onCancel={() => {
            setReopening(undefined);
            view.current?.focus();
          }}
        />
      )}
      {askingChanged && tab !== undefined && (
        <ConfirmPopup
          title={strings.editor.changedTitle}
          message={strings.editor.changedAsked}
          lines={strings.editor.overwriteLines(file)}
          confirm={strings.editor.saveOver}
          extra={{
            label: strings.editor.readAgain,
            onClick: () => {
              setAskingChanged(false);
              reloadEdited(tab);
              view.current?.focus();
            },
          }}
          onConfirm={() => {
            setAskingChanged(false);
            saveText(tab, { changed: true });
            view.current?.focus();
          }}
          onCancel={() => {
            setAskingChanged(false);
            view.current?.focus();
          }}
        />
      )}
      {askingOverwrite && tab !== undefined && (
        <ConfirmPopup
          title={strings.editor.overwriteTitle}
          message={strings.editor.overwriteAsked}
          lines={strings.editor.overwriteLines(file)}
          confirm={strings.editor.overwrite}
          onConfirm={() => {
            setAskingOverwrite(false);
            saveText(tab, { readOnly: true });
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
