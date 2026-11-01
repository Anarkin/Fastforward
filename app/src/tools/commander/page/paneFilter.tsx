import type { RefObject } from 'react';
import { commanderKeymap } from '../shared/keymap';
import { strings } from '../../../shared/strings';
import { keyPressed } from '../../../ui/shortcuts';
import { letterTyped } from '../../../shell/shared/keymap';

export type FilterMove = 'up' | 'down' | 'pageUp' | 'pageDown';

export function filterStep(
  move: FilterMove,
  from: number,
  count: number,
  page: number,
): number {
  const by =
    move === 'up' ? -1 : move === 'down' ? 1 : move === 'pageUp' ? -page : page;
  return Math.max(0, Math.min(count - 1, from + by));
}

export function PaneFilter({
  query,
  shown,
  total,
  input,
  onQuery,
  onMove,
  onLeave,
  onClose,
}: {
  query: string;
  shown: number;
  total: number;
  input: RefObject<HTMLInputElement | null>;
  onQuery: (query: string) => void;
  onMove: (move: FilterMove) => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  return (
    <div className={`find-field ${query ? 'active' : ''}`}>
      <input
        ref={input}
        className="find-field-input commander-filter-input"
        placeholder={strings.commander.filterPlaceholder}
        spellCheck={false}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (keyPressed(commanderKeymap.stopFiltering, event) !== undefined) {
            event.preventDefault();
            onClose();
            return;
          }
          if (keyPressed(commanderKeymap.leaveFilter, event) !== undefined) {
            event.preventDefault();
            onLeave();
            return;
          }
          const letter =
            keyPressed(commanderKeymap.filterLetter, event) === undefined
              ? undefined
              : letterTyped(event);
          if (letter !== undefined) {
            event.preventDefault();
            onQuery(query + letter);
            return;
          }
          if (keyPressed(commanderKeymap.filter, event) !== undefined) {
            event.preventDefault();
            event.currentTarget.select();
            return;
          }
          const move = keyPressed(commanderKeymap.filterMove, event);
          if (move !== undefined) {
            event.preventDefault();
            onMove(move);
          }
        }}
      />
      {query && (
        <span className="find-field-count">
          {strings.commander.filterCount(shown, total)}
        </span>
      )}
    </div>
  );
}
