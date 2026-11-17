import type { ReactNode, RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { strings } from '../../../lib/shared/strings';
import { keyPressed } from '../../../lib/page/shortcuts';
import { SearchBar } from '../../../lib/page/searchBar';
import { findKeyDown } from '../../../lib/page/findKeys';
import { focusNameAttribute } from '../../../lib/page/viewFocus';
import {
  replace,
  replaceAll,
  step,
  type countOf,
  type FindQuery,
} from './find';
import type { EditorFinding } from './finding';
import { editorKeymap } from './keymap';

export function EditorFindBar({
  view,
  finder,
  findCount,
  children,
}: {
  view: RefObject<EditorView | undefined>;
  finder: EditorFinding;
  findCount: ReturnType<typeof countOf> | undefined;
  children: ReactNode;
}) {
  const {
    finding,
    setFinding,
    replacing,
    setReplacing,
    query,
    setQuery,
    replacement,
    setReplacement,
    findInput,
  } = finder;
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
  return (
    <>
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
          <SearchBar
            font="monospace"
            query={query.text}
            options={query.options}
            found={{
              current: (findCount?.current ?? 0) - 1,
              matches: findCount?.matches ?? 0,
              capped: findCount?.capped,
            }}
            input={findInput}
            onQuery={(text) => search({ ...query, text })}
            onOptions={(options) => search({ ...query, options })}
            onStep={findStep}
            onClose={closeFind}
            onKeyDown={findKeyDown(editorKeymap, findStep, closeFind)}
          />
        </header>
      ) : (
        children
      )}
      {finding && replacing && (
        <div className="editor-replace">
          <input
            className="editor-replace-input"
            {...{ [focusNameAttribute]: 'replace' }}
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
    </>
  );
}
