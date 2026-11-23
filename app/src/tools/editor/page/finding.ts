import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { EditorSurface } from './surface';
import { find, findNearest, type FindAsk } from './find';
import { lineBreak } from './setup';
import { noKeptEditing, type KeptEditing } from './editing';
import { useEditor, useEditorActions } from './store';
import type { EditorStoreState } from './state';

type Changing<T> = T | ((was: T) => T);

export function useEditorFinding(
  view: RefObject<EditorSurface | undefined>,
  findAsk: FindAsk | undefined,
  tab: string | undefined,
  mounts: number,
) {
  const { keptEditing, keepEditing } = useEditorActions();
  const editing = (state: EditorStoreState) =>
    (tab === undefined ? undefined : state.editings.get(tab)) ?? noKeptEditing;
  const finding = useEditor((state) => editing(state).finding);
  const replacing = useEditor((state) => editing(state).replacing);
  const query = useEditor((state) => editing(state).query);
  const replacement = useEditor((state) => editing(state).replacement);
  const { setFinding, setReplacing, setQuery, setReplacement } = useMemo(() => {
    const change =
      <K extends 'finding' | 'replacing' | 'query' | 'replacement'>(key: K) =>
      (next: Changing<KeptEditing[K]>) => {
        if (tab === undefined) {
          return;
        }
        const was = keptEditing(tab)[key];
        keepEditing(tab, {
          [key]: typeof next === 'function' ? next(was) : next,
        });
      };
    return {
      setFinding: change('finding'),
      setReplacing: change('replacing'),
      setQuery: change('query'),
      setReplacement: change('replacement'),
    };
  }, [tab, keptEditing, keepEditing]);
  const [focusAsks, setFocusAsks] = useState(0);
  const findInput = useRef<HTMLInputElement>(null);
  const applied = useRef({ finding, query });
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
  }, [findAsk, setFinding, setReplacing, setQuery]);
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
