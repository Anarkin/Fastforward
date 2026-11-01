import type { RefObject } from 'react';
import type { Binding } from '../shell/shared/keymap';
import { strings } from '../shared/strings';
import { BackIcon, NextIcon, PreviousIcon, SearchIcon } from './icons';
import { keyPressed } from './shortcuts';

export function SearchButton({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      className="nav-button search-button"
      title={title}
      onClick={onClick}
    >
      <SearchIcon />
    </button>
  );
}

export function SearchRow({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="search-row">
      <button
        className="nav-button"
        title={strings.common.close}
        onClick={onClose}
      >
        <BackIcon />
      </button>
      {children}
    </div>
  );
}

export function FindField({
  query,
  count,
  countTitle,
  input,
  keys,
  onQuery,
  onStep,
  onClose,
}: {
  query: string;
  count: string;
  countTitle?: string;
  input?: RefObject<HTMLInputElement | null>;
  keys: {
    readonly match: Binding<1 | -1>;
    readonly stopFinding: Binding<boolean>;
  };
  onQuery: (query: string) => void;
  onStep: (step: 1 | -1) => void;
  onClose: () => void;
}) {
  return (
    <div className={`find-field ${query ? 'active' : ''}`}>
      <input
        ref={input}
        className="find-field-input"
        placeholder={strings.find.placeholder}
        spellCheck={false}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          const step = keyPressed(keys.match, event);
          if (step !== undefined) {
            event.preventDefault();
            onStep(step);
          } else if (keyPressed(keys.stopFinding, event)) {
            event.preventDefault();
            onClose();
          }
        }}
      />
      {count && (
        <span className="find-field-count" title={countTitle}>
          {count}
        </span>
      )}
    </div>
  );
}

export function FindActions({
  matches,
  onStep,
}: {
  matches: number;
  onStep: (step: 1 | -1) => void;
}) {
  return (
    <div className="nav-buttons">
      <button
        className="nav-button"
        title={strings.find.previous}
        disabled={matches === 0}
        onClick={() => onStep(-1)}
      >
        <PreviousIcon />
      </button>
      <button
        className="nav-button"
        title={strings.find.next}
        disabled={matches === 0}
        onClick={() => onStep(1)}
      >
        <NextIcon />
      </button>
    </div>
  );
}
