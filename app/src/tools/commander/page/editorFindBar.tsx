import type { ReactNode, RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { strings } from '../../../lib/shared/strings';
import { keyPressed } from '../../../lib/page/shortcuts';
import { FindActions, FindField, SearchRow } from '../../../lib/page/search';
import {
  replace,
  replaceAll,
  step,
  type countOf,
  type FindQuery,
} from './editorFind';
import type { EditorFinding } from './editorFinding';
import { editorKeymap } from './editorKeymap';

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
  const countShown =
    query.text === '' || findCount === undefined
      ? ''
      : findCount.invalid
        ? strings.find.badPattern
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
      title: strings.find.matchCase,
      glyph: strings.find.caseGlyph,
    },
    {
      key: 'wholeWord',
      title: strings.find.wholeWord,
      glyph: strings.find.wordGlyph,
    },
    {
      key: 'regex',
      title: strings.find.regexTitle,
      glyph: strings.find.regexGlyph,
    },
  ] as const;

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
                  className={`nav-button toggle ${query.options[key] ? 'active' : ''}`}
                  title={title}
                  aria-pressed={query.options[key]}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    search({
                      ...query,
                      options: { ...query.options, [key]: !query.options[key] },
                    })
                  }
                >
                  {glyph}
                </button>
              ))}
            </div>
            <FindActions matches={findCount?.matches ?? 0} onStep={findStep} />
          </SearchRow>
        </header>
      ) : (
        children
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
    </>
  );
}
