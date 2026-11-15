import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  Compartment,
  EditorSelection,
  EditorState,
  StateEffect,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useShell } from '../../../shell/page/store';
import { blanksShown } from './editorText';
import { useCellTable } from '../../../lib/page/cellTable';
import { countOf, findAskOf, type FindAsk } from './editorFind';
import { savingFixes } from './editorSaving';
import { endingsChanged, endingsField, endingsSent } from './editorEndings';
import { endingsShownOf, type EndingsShown } from './endingsLabel';
import {
  editorAt,
  placeIn,
  placeMapped,
  placeOf,
  type EditorPlace,
} from './editorPlace';
import type { CommanderSource } from './commanderState';
import { useCommander, useCommanderActions } from './store';
import { useShellActions } from '../../../shell/page/store';
import { pageCursorLook } from '../../../lib/page/cursor';
import {
  stateKeepDelay,
  bracketsClosed,
  extensionsOf,
  stateOf,
  keptJson,
  colorsOf,
  fieldsKept,
  type EditedTab,
} from './editorState';
import { statusOf } from './editorStatus';

export const editedShown = (state: CommanderSource): EditedTab | undefined =>
  state.edited?.tab === state.view.tab ? state.edited : undefined;

export function useEditorView(language: string | undefined) {
  const tab = useCommander((state) => state.view.tab);
  const edited = useCommander(editedShown);
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const scrolling = useShell((state) => state.scrolling);
  const scrollingNow = useEffectEvent(() => scrolling);
  const closesBrackets = useCommander((state) => state.view.closeBrackets);
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const {
    listenEditor,
    readEdited,
    editText,
    keepEditState,
    saveText,
    keptEditor,
    keepEditor,
  } = useCommanderActions();
  const { closeTab } = useShellActions();
  const [endingsShown, setEndingsShown] = useState<EndingsShown | undefined>();
  const [status, setStatus] = useState<string>();
  const [findCount, setFindCount] = useState<ReturnType<typeof countOf>>();
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
        close: () => closeTab(tab),
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
      const made = editorAt(element, state, back, () => {
        settling = false;
      });
      stopSettling = made.stop;
      made.view.scrollDOM.addEventListener('scroll', onScroll, {
        passive: true,
      });
      view.current = made.view;
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
    setEndingsShown(reused ? endingsShownOf(shown.state) : undefined);
    if (!reused) {
      readEdited(tab);
    }
    const stop = listenEditor((message) => {
      if (message.tab !== tab || message.type !== 'editedText') {
        return;
      }
      const head = shown.state.selection.main.head;
      version = message.shown.version;
      const next = stateOf(message.shown, message.state, extensions);
      const keptPlace = placeIn(message.state);
      if (message.reloaded === true) {
        shown.setState(next);
        shown.dispatch({
          selection: EditorSelection.cursor(
            Math.min(head, shown.state.doc.length),
          ),
          scrollIntoView: true,
        });
      } else if (message.at !== undefined) {
        const start = next.doc.lineAt(
          Math.min(message.at, next.doc.length),
        ).from;
        remount(
          next.update({ selection: EditorSelection.cursor(start) }).state,
          { from: start, offset: 0 },
        );
        keepState(shown.state);
      } else if (keptPlace !== undefined) {
        place = keptPlace;
        remount(next, keptPlace);
      } else {
        shown.setState(next);
      }
      keepEditor(tab, { state: shown.state, version, place });
      setEndingsShown(endingsShownOf(shown.state));
      setStatus(statusOf(shown.state, table));
      shown.focus();
    });
    shown.focus();
    return () => {
      stop();
      stopSettling();
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
    closeTab,
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

  return {
    host,
    view,
    endingsShown,
    status,
    findCount,
    findAsk,
    setFindAsk,
    goingToLine,
    setGoingToLine,
    lineCount,
  };
}
