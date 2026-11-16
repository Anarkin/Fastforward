import { useEffect, useRef, useState, type RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { find, findNearest, type FindAsk } from './editorFind';
import { lineBreak } from './editorState';
import { noKeptEditing } from './editorKept';
import { useEditorActions } from './store';

export function useEditorFinding(
  view: RefObject<EditorView | undefined>,
  findAsk: FindAsk | undefined,
  tab: string | undefined,
  mounts: number,
) {
  const { keptEditing, keepEditing } = useEditorActions();
  const [kept] = useState(() =>
    tab === undefined ? noKeptEditing : keptEditing(tab),
  );
  const [finding, setFinding] = useState(kept.finding);
  const [replacing, setReplacing] = useState(kept.replacing);
  const [query, setQuery] = useState(kept.query);
  const [replacement, setReplacement] = useState(kept.replacement);
  const [focusAsks, setFocusAsks] = useState(0);
  const findInput = useRef<HTMLInputElement>(null);
  const applied = useRef({ finding: kept.finding, query: kept.query });
  useEffect(() => {
    if (tab !== undefined) {
      keepEditing(tab, { finding, replacing, query, replacement });
    }
  }, [tab, keepEditing, finding, replacing, query, replacement]);
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
    const shown = view.current;
    if (shown === undefined || mounts === 0) {
      return;
    }
    const asked =
      applied.current.finding !== finding || applied.current.query !== query;
    applied.current = { finding, query };
    find(shown, finding ? query : undefined);
    if (finding && asked) {
      findNearest(shown);
    }
  }, [finding, query, view, mounts]);
  useEffect(() => {
    if (focusAsks > 0) {
      findInput.current?.focus();
      findInput.current?.select();
    }
  }, [focusAsks]);
  return {
    finding,
    setFinding,
    replacing,
    setReplacing,
    query,
    setQuery,
    replacement,
    setReplacement,
    findInput,
  };
}

export type EditorFinding = ReturnType<typeof useEditorFinding>;
