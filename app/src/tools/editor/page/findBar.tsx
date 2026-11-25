import type { RefObject } from 'react';
import type { EditorSurface } from './surface';
import { strings } from '../../../lib/shared/strings';
import { keyPressed } from '../../../lib/page/shortcuts';
import { SearchBar } from '../../../lib/page/searchBar';
import { findKeyDown } from '../../../lib/page/findKeys';
import { focusNameAttribute } from '../../../lib/page/viewFocus';
import {
  replace,
  replaceAll,
  step,
  type FindCount,
  type FindQuery,
} from './find';
import type { EditorFinding } from './finding';
import { editorKeymap } from './keymap';
import { FloatingSearch } from '../../../lib/page/floatingSearch';
import { Toolbar } from '../../../lib/page/toolbar';
import { labelTip } from '../../../lib/page/tips';
import { ReplaceAllIcon, ReplaceIcon } from '../../../lib/page/icons';

export function EditorFindBar({
  view,
  finder,
  findCount,
}: {
  view: RefObject<EditorSurface | undefined>;
  finder: EditorFinding;
  findCount: FindCount | undefined;
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
  if (!finding) {
    return null;
  }
  return (
    <FloatingSearch
      below
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
      {replacing && (
        <Toolbar className="search-bar monospace replace-bar">
          <div className={`search-box${replacement ? ' active' : ''}`}>
            <input
              className="editor-replace-input search-box-input"
              {...{ [focusNameAttribute]: 'replace' }}
              placeholder={strings.editor.replacePlaceholder}
              aria-label={strings.editor.replacePlaceholder}
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
          </div>
          <Toolbar className="search-steps">
            <button
              className="nav-button"
              {...labelTip(strings.editor.replaceOne)}
              disabled={(findCount?.matches ?? 0) === 0}
              onClick={() => {
                if (view.current !== undefined) {
                  replace(view.current, replacement);
                }
              }}
            >
              <ReplaceIcon />
            </button>
            <button
              className="nav-button"
              {...labelTip(strings.editor.replaceAll)}
              disabled={(findCount?.matches ?? 0) === 0}
              onClick={() => {
                if (view.current !== undefined) {
                  replaceAll(view.current, replacement);
                  view.current.focus();
                }
              }}
            >
              <ReplaceAllIcon />
            </button>
          </Toolbar>
          <span className="nav-button-room" />
        </Toolbar>
      )}
    </FloatingSearch>
  );
}
