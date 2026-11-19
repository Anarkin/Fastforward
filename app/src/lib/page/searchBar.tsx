import { closeTip } from './closeTip';
import { labelTip, tip } from './tips';
import type { InputHTMLAttributes, KeyboardEvent, RefObject } from 'react';
import type { SearchOptions } from '../shared/searchOptions';
import { strings } from '../shared/strings';
import { matchCount, type MatchesFound } from '../shared/textMatches';
import { BackIcon, NextIcon, PreviousIcon } from './icons';
import { focusNameAttribute } from './viewFocus';
import { Toolbar } from './toolbar';

const toggles = [
  {
    option: 'caseSensitive',
    title: strings.find.matchCase,
    glyph: strings.find.caseGlyph,
  },
  {
    option: 'wholeWord',
    title: strings.find.wholeWord,
    glyph: strings.find.wordGlyph,
  },
  {
    option: 'regex',
    title: strings.find.regexTitle,
    glyph: strings.find.regexGlyph,
  },
] as const;

type ComboboxProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | 'role'
  | 'autoFocus'
  | 'aria-expanded'
  | 'aria-autocomplete'
  | 'aria-controls'
  | 'aria-activedescendant'
>;

function SearchToggles({
  options,
  compact,
  noRegex,
  onOptions,
}: {
  options: SearchOptions;
  compact: boolean;
  noRegex: string | undefined;
  onOptions: (options: SearchOptions) => void;
}) {
  return (
    <div className="search-toggles">
      {toggles.map(({ option, title, glyph }) => {
        const off = option === 'regex' && noRegex !== undefined;
        const pressed = !off && options[option];
        return (
          <button
            key={option}
            className={`search-toggle${pressed ? ' active' : ''}`}
            {...labelTip(off ? noRegex : title)}
            aria-pressed={pressed}
            disabled={off}
            tabIndex={compact ? -1 : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              onOptions({ ...options, [option]: !options[option] })
            }
          >
            {glyph}
          </button>
        );
      })}
    </div>
  );
}

export function SearchBar({
  query,
  font,
  options,
  found,
  countTitle,
  placeholder = strings.find.placeholder,
  input,
  focusName = 'find',
  compact = false,
  noRegex,
  combobox,
  onQuery,
  onOptions,
  onStep,
  stepKeys,
  onClose,
  onKeyDown,
}: {
  query: string;
  font: 'monospace' | 'proportional';
  options: SearchOptions;
  found: MatchesFound;
  countTitle?: string;
  placeholder?: string;
  input?: RefObject<HTMLInputElement | null>;
  focusName?: string;
  compact?: boolean;
  noRegex?: string;
  combobox?: ComboboxProps;
  onQuery: (query: string) => void;
  onOptions: (options: SearchOptions) => void;
  onStep?: (step: 1 | -1) => void;
  stepKeys?: readonly [previous: string | undefined, next: string | undefined];
  onClose?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const shown = noRegex === undefined ? options : { ...options, regex: false };
  const count = matchCount(query, shown, found);
  const toggled = (
    <SearchToggles
      options={options}
      compact={compact}
      noRegex={noRegex}
      onOptions={onOptions}
    />
  );
  return (
    <Toolbar
      className={`search-bar${font === 'monospace' ? ' monospace' : ''}${compact ? ' compact' : ''}`}
    >
      {!compact && onClose !== undefined && (
        <button className="nav-button" {...closeTip} onClick={onClose}>
          <BackIcon />
        </button>
      )}
      <div className={`search-box${query ? ' active' : ''}`}>
        <input
          ref={input}
          className="search-box-input"
          placeholder={placeholder}
          aria-label={placeholder}
          spellCheck={false}
          value={query}
          {...{ [focusNameAttribute]: focusName }}
          {...combobox}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {count && (
          <span className="search-count" {...tip(countTitle)}>
            {count}
          </span>
        )}
        {toggled}
      </div>
      {!compact && onStep !== undefined && (
        <Toolbar className="search-steps">
          <button
            className="nav-button"
            {...labelTip(strings.find.previous, { keys: stepKeys?.[0] })}
            disabled={found.matches === 0}
            onClick={() => onStep(-1)}
          >
            <PreviousIcon />
          </button>
          <button
            className="nav-button"
            {...labelTip(strings.find.next, { keys: stepKeys?.[1] })}
            disabled={found.matches === 0}
            onClick={() => onStep(1)}
          >
            <NextIcon />
          </button>
        </Toolbar>
      )}
    </Toolbar>
  );
}
