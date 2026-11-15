import type { RefObject } from 'react';
import { commanderKeymap } from './keymap';
import { strings } from '../../../lib/shared/strings';
import { keyPressed } from '../../../lib/page/shortcuts';
import { SearchBar } from '../../../lib/page/searchBar';
import { letterTyped } from '../../../lib/shared/keymap';
import type { SearchOptions } from '../../../lib/shared/searchOptions';
import type { MatchesFound } from '../../../lib/shared/textMatches';
import { type FilterMove } from './filterSteps';
import type { Side } from '../shared/sides';

const filterFocusOf = (side: Side) => `filter ${side}`;

export function PaneFilter({
  side,
  query,
  options,
  found,
  input,
  onQuery,
  onOptions,
  onStep,
  onMove,
  onLeave,
  onClose,
}: {
  side: Side;
  query: string;
  options: SearchOptions;
  found: MatchesFound;
  input: RefObject<HTMLInputElement | null>;
  onQuery: (query: string) => void;
  onOptions: (options: SearchOptions) => void;
  onStep: (step: 1 | -1) => void;
  onMove: (move: FilterMove) => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  return (
    <SearchBar
      font="monospace"
      query={query}
      options={options}
      found={found}
      placeholder={strings.commander.filterPlaceholder}
      input={input}
      focusName={filterFocusOf(side)}
      onQuery={onQuery}
      onOptions={onOptions}
      onStep={onStep}
      onClose={onClose}
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
  );
}
