import { indentShownOf, type IndentShown } from './indent';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import {
  Compartment,
  EditorSelection,
  EditorState,
  StateEffect,
} from '@codemirror/state';
import type { EditorSurface } from './surface';
import { useShell } from '../../../shell/page/store';
import { blanksShown } from './text';
import { useCellTable } from '../../../lib/page/cellTable';
import {
  countOf,
  findAskOf,
  keptCount,
  type FindAsk,
  type FindCount,
} from './find';
import { savingFixes } from './saving';
import { endingsChanged, endingsField, endingsSent } from './endings';
import { endingsShownOf, type EndingsShown } from './endingsLabel';
import {
  backTo,
  editorAt,
  placeIn,
  placeMapped,
  placeOf,
  type EditorPlace,
} from './place';
import { useEditor, useEditorActions } from './store';
import { editedShown } from './state';
import { useShellActions } from '../../../shell/page/store';
import { pageCursorLook } from '../../../lib/page/cursor';
import { focusBack } from '../../../lib/page/viewFocus';
import {
  stateKeepDelay,
  bracketsClosed,
  occurrencesMarked,
  wrappedLines,
  extensionsOf,
  stateOf,
  settingsKept,
  keptJson,
  colorsOf,
  fieldsKept,
} from './setup';
import { statusOf } from './status';

function keptIndent(
  before: IndentShown | undefined,
  state: EditorState,
): IndentShown {
  const now = indentShownOf(state);
  return before !== undefined &&
    before.indent === now.indent &&
    before.lines === now.lines &&
    before.rules === now.rules
    ? before
    : now;
}

export function useEditorView(language: string | undefined) {
  const tab = useEditor((state) => state.tab);
  const edited = useEditor(editedShown);
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const scrolling = useShell((state) => state.scrolling);
  const scrollingNow = useEffectEvent(() => scrolling);
  const closesBrackets = useEditor((state) => state.closeBrackets);
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const marksOccurrences = useShell(
    (state) => state.textView.highlightOccurrences,
  );
  const {
    listenEditor,
    readEdited,
    editText,
    keepEditState,
    saveText,
    keptEditor,
    editorKeeper,
    keptEditing,
    keepEditing,
    compareVersions,
    viewEdited,
  } = useEditorActions();
  const { closeTab } = useShellActions();
  const [endingsShown, setEndingsShown] = useState<EndingsShown | undefined>();
  const [indentShown, setIndentShown] = useState<IndentShown | undefined>();
  const [status, setStatus] = useState<string>();
  const [findCount, setFindCount] = useState<FindCount>();
  const [findAsk, setFindAsk] = useState<FindAsk>();
  const goingToLine = useEditor(
    (state) =>
      tab !== undefined && state.editings.get(tab)?.goingToLine !== undefined,
  );
  const setGoingToLine = useCallback(
    (going: boolean) => {
      if (tab !== undefined) {
        keepEditing(tab, {
          goingToLine: going
            ? (keptEditing(tab).goingToLine ?? { value: '' })
            : undefined,
        });
      }
    },
    [tab, keptEditing, keepEditing],
  );
  const [lineCount, setLineCount] = useState(0);
  const [mounts, setMounts] = useState(0);
  const table = useCellTable();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorSurface | undefined>(undefined);
  const wrapping = useRef(new Compartment());
  const blanking = useRef(new Compartment());
  const closing = useRef(new Compartment());
  const occurring = useRef(new Compartment());
  const coloring = useRef(new Compartment());
  const loaded = edited?.version !== undefined;
  const readOnly = edited?.readOnly === true;
  const startingVersion = useEffectEvent(() => edited?.version ?? 0);
  const wrapsFirst = useEffectEvent(() => wordWrap);
  const blanksFirst = useEffectEvent(() => showWhitespace);
  const closesFirst = useEffectEvent(() => closesBrackets);
  const marksFirst = useEffectEvent(() => marksOccurrences);
  const colorsFirst = useEffectEvent(() => colorsOf(language, highlightSyntax));

  useEffect(() => {
    if (tab === undefined || !loaded || table === undefined) {
      return undefined;
    }
    const element = host.current;
    if (element === null) {
      return undefined;
    }
    const keepEditor = editorKeeper(tab);
    let focusLeft = keptEditing(tab).focus;
    const focusFirst = () => {
      const root = element.closest('.editor');
      const back =
        root !== null && focusLeft !== undefined && focusBack(root, focusLeft);
      focusLeft = undefined;
      if (!back) {
        shown.focus();
      }
    };
    let version = startingVersion();
    let place: EditorPlace | undefined;
    let keepTimer: ReturnType<typeof setTimeout> | undefined;
    const keepState = (state: EditorState) => {
      keepEditor({ state, version, place });
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
      occurring: occurring.current,
      marksOccurrences: marksFirst(),
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
        close: () => closeTab(tab),
        view: () => viewEdited(tab, placeOf(shown).from),
        compare: () => compareVersions(tab),
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
        if (update.transactions.some((each) => each.effects.length > 0)) {
          setIndentShown((before) => keptIndent(before, update.state));
        }
        if (update.docChanged || update.selectionSet) {
          keepState(update.state);
          setStatus(statusOf(update.state, table));
        }
        const count = countOf(update.state);
        setFindCount((before) => keptCount(before, count));
      },
    });
    const kept = keptEditor(tab);
    const reused = kept !== undefined && kept.version === version;
    let readAgain = reused ? undefined : kept;
    let settling = false;
    let stopSettling = () => {};
    const onScroll = () => {
      if (!settling) {
        place = placeOf(shown);
        keepState(shown.state);
      }
    };
    const mounted = (state: EditorState, back?: EditorPlace) => {
      stopSettling();
      settling = back !== undefined;
      const made = editorAt(element, state, table, back, () => {
        settling = false;
      });
      stopSettling = made.stop;
      made.view.scrollDOM.addEventListener('scroll', onScroll, {
        passive: true,
      });
      view.current = made.view;
      setMounts((count) => count + 1);
      setLineCount(made.view.state.doc.lines);
      return made.view;
    };
    const remount = (state: EditorState, back: EditorPlace) => {
      shown.scrollDOM.removeEventListener('scroll', onScroll);
      shown.destroy();
      shown = mounted(state, back);
    };
    if (reused) {
      place = kept.place;
    }
    let shown = reused
      ? mounted(
          kept.state.update({
            effects: StateEffect.reconfigure.of([extensions, fieldsKept]),
          }).state,
          kept.place,
        )
      : mounted(EditorState.create({ extensions: [extensions, fieldsKept] }));
    setStatus(reused ? statusOf(shown.state, table) : undefined);
    setFindCount(reused ? countOf(shown.state) : undefined);
    setEndingsShown(reused ? endingsShownOf(shown.state) : undefined);
    setIndentShown(reused ? indentShownOf(shown.state) : undefined);
    if (!reused) {
      readEdited(tab);
    }
    const stop = listenEditor((message) => {
      if (message.tab !== tab || message.type !== 'editedText') {
        return;
      }
      const head = shown.state.selection.main.head;
      version = message.shown.version;
      const keptState =
        message.state === undefined ? undefined : parsedState(message.state);
      const next = settingsKept(
        stateOf(message.shown, keptState, extensions),
        shown.state,
        [
          wrapping.current,
          blanking.current,
          closing.current,
          occurring.current,
          coloring.current,
        ],
      );
      const keptPlace = placeIn(keptState);
      if (message.reloaded === true) {
        const left = settling && place !== undefined ? place : placeOf(shown);
        shown.setState(next);
        shown.dispatch({
          selection: EditorSelection.cursor(
            Math.min(head, shown.state.doc.length),
          ),
          effects: backTo(shown.state.doc, left),
        });
      } else if (message.at !== undefined) {
        const start = next.doc.lineAt(
          Math.min(message.at, next.doc.length),
        ).from;
        place = { from: start, offset: 0 };
        remount(
          next.update({ selection: EditorSelection.cursor(start) }).state,
          place,
        );
        keepState(shown.state);
      } else if (keptPlace !== undefined) {
        place = keptPlace;
        remount(next, keptPlace);
      } else if (readAgain === undefined) {
        shown.setState(next);
      } else {
        const length = next.doc.length;
        const cursor = EditorSelection.cursor(
          Math.min(readAgain.state.selection.main.head, length),
        );
        const left = readAgain.place;
        place =
          left === undefined
            ? undefined
            : { ...left, from: Math.min(left.from, length) };
        const moved = next.update({ selection: cursor }).state;
        if (place === undefined) {
          shown.setState(moved);
        } else {
          remount(moved, place);
        }
      }
      readAgain = undefined;
      keepEditor({ state: shown.state, version, place });
      setEndingsShown(endingsShownOf(shown.state));
      setIndentShown((before) => keptIndent(before, shown.state));
      setStatus(statusOf(shown.state, table));
      setFindCount(countOf(shown.state));
      focusFirst();
    });
    if (reused) {
      focusFirst();
    } else {
      shown.focus();
    }
    return () => {
      stop();
      stopSettling();
      clearTimeout(keepTimer);
      shown.scrollDOM.removeEventListener('scroll', onScroll);
      keepEditor({ state: shown.state, version, place });
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
    editorKeeper,
    keptEditor,
    keptEditing,
    listenEditor,
    readEdited,
    saveText,
    closeTab,
    viewEdited,
    compareVersions,
    setGoingToLine,
  ]);

  useEffect(() => {
    view.current?.dispatch({
      effects: wrapping.current.reconfigure(wrappedLines(wordWrap)),
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
      effects: occurring.current.reconfigure(
        occurrencesMarked(marksOccurrences),
      ),
    });
  }, [marksOccurrences]);

  useEffect(() => {
    view.current?.dispatch({
      effects: coloring.current.reconfigure(
        colorsOf(language, highlightSyntax),
      ),
    });
  }, [language, highlightSyntax]);

  return {
    host,
    view,
    endingsShown,
    indentShown,
    status,
    findCount,
    findAsk,
    setFindAsk,
    goingToLine,
    setGoingToLine,
    lineCount,
    mounts,
  };
}

function parsedState(state: string): unknown {
  try {
    return JSON.parse(state);
  } catch {
    return undefined;
  }
}
