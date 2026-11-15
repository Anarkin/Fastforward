import { useEffect, useRef, useState, type RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { find, findNearest, type FindAsk, type FindQuery } from './editorFind';
import { lineBreak } from './editorState';

export function useEditorFinding(
  view: RefObject<EditorView | undefined>,
  findAsk: FindAsk | undefined,
) {
  const [finding, setFinding] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [query, setQuery] = useState<FindQuery>({
    text: '',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  const [replacement, setReplacement] = useState('');
  const [focusAsks, setFocusAsks] = useState(0);
  const findInput = useRef<HTMLInputElement>(null);
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
  }, [finding, query, view]);
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
