import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  Compartment,
  EditorSelection,
  EditorState,
  StateEffect,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { strings } from '../../../lib/shared/strings';
import { ConfirmPopup } from '../../../shell/page/confirmPopup';
import { useShell, useShellActions } from '../../../shell/page/store';
import { blanksShown } from './editorText';
import { ShowWhitespaceIcon, WordWrapIcon } from '../../../lib/page/icons';
import { Words } from '../../../lib/page/name';
import { languageOf } from '../../../lib/page/languages';
import { keyPressed } from '../../../lib/page/shortcuts';
import { startColorer } from '../../../lib/page/syntax';
import { useCellTable } from '../../../lib/page/textWidths';
import { StatusLine } from './statusLine';
import {
  FindActions,
  FindField,
  SearchButton,
  SearchRow,
} from '../../../lib/page/search';
import {
  countOf,
  find,
  findNearest,
  replace,
  replaceAll,
  step,
  type FindQuery,
} from './editorFind';
import { PromptPopup } from '../../../shell/page/promptPopup';
import { savingFixes } from './editorSaving';
import { editorKeymap } from './keymap';
import { type TextEncoding } from '../shared/protocol';
import {
  encodingSourceItems,
  endingSourceItems,
  type SourceOpening,
} from './editorSources';
import {
  conversionsOf,
  convertedTo,
  endingsChanged,
  endingsField,
  endingsSent,
} from './editorEndings';
import { colorOfFileNamed } from './fileColors';
import { viewerChoices } from './view';
import type { LineEnding } from '../shared/textMarks';
import { MenuButton } from '../../../lib/page/menu';
import {
  LanguageButton,
  languageChoiceOf,
  shownLanguage,
} from '../../../lib/page/languageChoice';
import { nameOf, PathTitle } from './pathTitle';
import { readMenu, savedName, saveMenu } from './editorEncodings';
import {
  backTo,
  placeIn,
  placeMapped,
  placeOf,
  type EditorPlace,
} from './editorPlace';
import { useCommander, useCommanderActions } from './store';
import { pageCursorLook } from '../../../lib/page/cursor';

import {
  stateKeepDelay,
  bracketsClosed,
  extensionsOf,
  stateOf,
  lineBreak,
  EndingsShown,
  endingsShownOf,
  endingsLabel,
  linesEnding,
  endingsTitle,
  keptJson,
  colorsOf,
  fieldsKept,
  FindAsk,
  findAskOf,
  statusOf,
} from './editorState';

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
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const scrolling = useShell((state) => state.scrolling);
  const scrollingNow = useEffectEvent(() => scrolling);
  const closesBrackets = useCommander((state) => state.view.closeBrackets);
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const { changeTextView, openSettings } = useShellActions();
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
    editSource,
  } = useCommanderActions();
  const [endingsShown, setEndingsShown] = useState<EndingsShown | undefined>();
  const [reopening, setReopening] = useState<TextEncoding | 'auto'>();
  const [status, setStatus] = useState<string>();
  const [finding, setFinding] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [query, setQuery] = useState<FindQuery>({
    text: '',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  const [replacement, setReplacement] = useState('');
  const [findCount, setFindCount] = useState<ReturnType<typeof countOf>>();
  const [focusAsks, setFocusAsks] = useState(0);
  const findInput = useRef<HTMLInputElement>(null);
  const [findAsk, setFindAsk] = useState<FindAsk>();
  const [goingToLine, setGoingToLine] = useState(false);
  const [lineCount, setLineCount] = useState(0);
  const table = useCellTable();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const wrapping = useRef(new Compartment());
  const blanking = useRef(new Compartment());
  const closing = useRef(new Compartment());
  const coloring = useRef(new Compartment());
  const [askingOverwrite, setAskingOverwrite] = useState(false);
  const [askingChanged, setAskingChanged] = useState(false);
  const loaded = edited?.version !== undefined;
  const readOnly = edited?.readOnly === true;
  const startingVersion = useEffectEvent(() => edited?.version ?? 0);
  const wrapsFirst = useEffectEvent(() => wordWrap);
  const blanksFirst = useEffectEvent(() => showWhitespace);
  const closesFirst = useEffectEvent(() => closesBrackets);
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
    let place: EditorPlace | undefined;
    let keepTimer: ReturnType<typeof setTimeout> | undefined;
    const keepState = (state: EditorState) => {
      keepEditor(tab, { state, version, place });
      clearTimeout(keepTimer);
      keepTimer = setTimeout(
        () => keepEditState(tab, version, keptJson(state, place)),
        stateKeepDelay,
      );
    };
    const extensions = extensionsOf({
      table,
      readOnly,
      wrapping: wrapping.current,
      wordWrap: wrapsFirst(),
      blanking: blanking.current,
      showWhitespace: blanksFirst(),
      closing: closing.current,
      closesBrackets: closesFirst(),
      coloring: coloring.current,
      colors: colorsFirst(),
      cursor: pageCursorLook(),
      keys: {
        save: () => {
          const fixes = savingFixes(shown.state);
          if (fixes !== undefined) {
            shown.dispatch(fixes);
          }
          saveText(tab);
        },
        find: () => setFindAsk(findAskOf(false, shown.state)),
        replace: () => setFindAsk(findAskOf(true, shown.state)),
        goToLine: () => {
          setLineCount(shown.state.doc.lines);
          setGoingToLine(true);
        },
      },
      scrolling: scrollingNow,
      onUpdate: (update) => {
        const converted = endingsChanged(update.transactions);
        if (update.docChanged && place !== undefined) {
          place = placeMapped(place, update.changes);
        }
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
        setFindCount(countOf(update.state));
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
    } else if (kept.place !== undefined) {
      place = kept.place;
      shown.dispatch({ effects: backTo(shown, kept.place) });
    }
    const onScroll = () => {
      place = placeOf(shown);
      keepState(shown.state);
    };
    shown.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
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
      } else if (message.at !== undefined) {
        const start = shown.state.doc.lineAt(
          Math.min(message.at, shown.state.doc.length),
        ).from;
        shown.dispatch({
          selection: EditorSelection.cursor(start),
          effects: EditorView.scrollIntoView(start, {
            y: 'start',
            yMargin: shown.defaultLineHeight / 2,
          }),
        });
      } else {
        const keptPlace = placeIn(message.state);
        if (keptPlace !== undefined) {
          place = keptPlace;
          shown.dispatch({ effects: backTo(shown, keptPlace) });
        }
      }
      keepEditor(tab, { state: shown.state, version, place });
      setEndingsShown(endingsShownOf(shown.state));
      setStatus(statusOf(shown.state, table));
      shown.focus();
    });
    shown.focus();
    return () => {
      stop();
      clearTimeout(keepTimer);
      shown.scrollDOM.removeEventListener('scroll', onScroll);
      keepEditor(tab, { state: shown.state, version, place });
      keepEditState(tab, version, keptJson(shown.state, place));
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
      effects: blanking.current.reconfigure(blanksShown.of(showWhitespace)),
    });
  }, [showWhitespace]);

  useEffect(() => {
    view.current?.dispatch({
      effects: closing.current.reconfigure(
        closesBrackets ? bracketsClosed : [],
      ),
    });
  }, [closesBrackets]);

  useEffect(() => {
    view.current?.dispatch({
      effects: coloring.current.reconfigure(
        colorsOf(language, highlightSyntax),
      ),
    });
  }, [language, highlightSyntax]);

  const encoding = edited?.encoding;
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
  const opening: SourceOpening = {
    file: (source) => {
      if (tab !== undefined) {
        editSource(tab, source);
      }
    },
    settings: openSettings,
  };
  const endingSources = edited?.endingSources;
  const encodingSources = edited?.encodingSources;
  const firstSource = encodingSources?.[0];
  const chosenEncoding =
    (firstSource?.kind === 'chosen' && firstSource.encoding) || 'auto';
  const made = edited?.made === true;
  const bom = edited?.bom === true;
  const encodingSourcesShown =
    encodingSources === undefined
      ? []
      : encodingSourceItems(encodingSources, opening);
  const convert = (ending: LineEnding) =>
    view.current?.dispatch(convertedTo(ending));
  useEffect(() => {
    if (findAsk === undefined) {
      return;
    }
    const { selected } = findAsk;
    if (selected !== '' && !selected.includes(lineBreak)) {
      setQuery((was) => ({ ...was, text: selected }));
    }
    setFinding(true);
    setReplacing((was) => was || findAsk.replace);
    setFocusAsks((asks) => asks + 1);
  }, [findAsk]);
  useEffect(() => {
    if (view.current !== undefined) {
      find(view.current, finding ? query : undefined);
      if (finding) {
        findNearest(view.current);
      }
    }
  }, [finding, query]);
  useEffect(() => {
    if (focusAsks > 0) {
      findInput.current?.focus();
      findInput.current?.select();
    }
  }, [focusAsks]);
  const search = (asked: FindQuery) => setQuery(asked);
  const closeFind = () => {
    setFinding(false);
    setReplacing(false);
    view.current?.focus();
  };
  const findStep = (direction: 1 | -1) => {
    if (view.current !== undefined) {
      step(view.current, direction);
    }
  };
  const countShown =
    query.text === '' || findCount === undefined
      ? ''
      : findCount.invalid
        ? strings.editor.badPattern
        : findCount.matches === 0
          ? strings.find.noResults
          : strings.find.count(
              findCount.current,
              findCount.matches,
              findCount.capped,
            );
  const toggles = [
    {
      key: 'caseSensitive',
      title: strings.editor.matchCase,
      glyph: strings.editor.caseGlyph,
    },
    {
      key: 'wholeWord',
      title: strings.editor.wholeWord,
      glyph: strings.editor.wordGlyph,
    },
    {
      key: 'regex',
      title: strings.editor.regexTitle,
      glyph: strings.editor.regexGlyph,
    },
  ] as const;

  const mark = edited?.readOnly
    ? strings.editor.readOnlyMark
    : edited?.changed
      ? strings.editor.unsaved
      : edited?.made
        ? strings.editor.newFile
        : undefined;

  return (
    <section className="column viewer editor">
      {finding ? (
        <header
          className="column-title searching"
          onKeyDown={(event) => {
            if (keyPressed(editorKeymap.replace, event) !== undefined) {
              event.preventDefault();
              setReplacing(true);
            }
          }}
        >
          <SearchRow onClose={closeFind}>
            <FindField
              query={query.text}
              count={countShown}
              input={findInput}
              keys={editorKeymap}
              onQuery={(text) => search({ ...query, text })}
              onStep={findStep}
              onClose={closeFind}
            />
            <div className="nav-buttons">
              {toggles.map(({ key, title, glyph }) => (
                <button
                  key={key}
                  className={`nav-button toggle ${query[key] ? 'active' : ''}`}
                  title={title}
                  aria-pressed={query[key]}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => search({ ...query, [key]: !query[key] })}
                >
                  {glyph}
                </button>
              ))}
            </div>
            <FindActions matches={findCount?.matches ?? 0} onStep={findStep} />
          </SearchRow>
        </header>
      ) : (
        <header className="column-title">
          <div className="column-start nav-buttons viewer-actions">
            {tab !== undefined && encoding !== undefined && !readOnly && (
              <>
                {!made && (
                  <div className="viewer-encoding editor-encoding">
                    <MenuButton
                      title={strings.editor.readEncodingTitle}
                      label={strings.editor.readLabel(
                        strings.commander.encodingShort[
                          edited?.onDisk?.encoding ?? encoding
                        ],
                      )}
                      filter={strings.common.findEncoding}
                      items={readMenu(
                        {
                          choice: chosenEncoding,
                          shown: edited?.onDisk?.encoding ?? encoding,
                        },
                        reopen,
                        encodingSourcesShown,
                      )}
                      onChosen={() => view.current?.focus()}
                    />
                  </div>
                )}
                <div className="viewer-encoding editor-encoding">
                  <MenuButton
                    title={strings.editor.writeEncodingTitle}
                    label={strings.editor.writeLabel(savedName(encoding, bom))}
                    filter={strings.common.findEncoding}
                    items={saveMenu(
                      { saving: encoding, bom, onDisk: edited?.onDisk },
                      (each, withBom) => saveIn(tab, each, withBom),
                      made ? encodingSourcesShown : [],
                    )}
                    onChosen={() => view.current?.focus()}
                  />
                </div>
              </>
            )}
            {endingsShown !== undefined && !readOnly && (
              <div className="viewer-encoding">
                <MenuButton
                  title={endingsTitle(endingsShown)}
                  label={endingsLabel(endingsShown)}
                  items={[
                    ...conversionsOf(endingsShown.counts).map(
                      ({ ending, label, changes }) => ({
                        label,
                        ...(changes
                          ? { onClick: () => convert(ending) }
                          : { disabled: true }),
                      }),
                    ),
                    ...(endingSources === undefined
                      ? []
                      : [
                          { separator: true } as const,
                          ...endingSourceItems(
                            endingSources,
                            linesEnding(endingsShown),
                            opening,
                          ),
                        ]),
                  ]}
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
                className={`nav-button toggle ${showWhitespace ? 'active' : ''}`}
                title={strings.common.showWhitespace}
                aria-pressed={showWhitespace}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  changeTextView({ showWhitespace: !showWhitespace })
                }
              >
                <ShowWhitespaceIcon />
              </button>
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
          <div className="column-actions">
            <SearchButton
              title={strings.commander.findInFile}
              onClick={() => setFindAsk(findAskOf(false, view.current?.state))}
            />
          </div>
        </header>
      )}
      {finding && replacing && (
        <div className="editor-replace">
          <input
            className="find-field-input editor-replace-input"
            placeholder={strings.editor.replacePlaceholder}
            spellCheck={false}
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => {
              if (keyPressed(editorKeymap.match, event) !== undefined) {
                event.preventDefault();
                if (view.current !== undefined) {
                  replace(view.current, replacement);
                }
              } else if (keyPressed(editorKeymap.stopFinding, event)) {
                event.preventDefault();
                closeFind();
              }
            }}
          />
          <button
            className="confirm-button"
            disabled={(findCount?.matches ?? 0) === 0}
            onClick={() => {
              if (view.current !== undefined) {
                replace(view.current, replacement);
              }
            }}
          >
            {strings.editor.replaceOne}
          </button>
          <button
            className="confirm-button"
            disabled={(findCount?.matches ?? 0) === 0}
            onClick={() => {
              if (view.current !== undefined) {
                replaceAll(view.current, replacement);
                view.current.focus();
              }
            }}
          >
            {strings.editor.replaceAll}
          </button>
        </div>
      )}
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
