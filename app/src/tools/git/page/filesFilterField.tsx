import type { RefObject } from 'react';
import { strings } from '../../../lib/shared/strings';
import { keyPressed } from '../../../lib/page/shortcuts';
import { SearchBar } from '../../../lib/page/searchBar';
import type { SearchOptions } from '../../../lib/shared/searchOptions';
import type { MatchesFound } from '../../../lib/shared/textMatches';
import { gitKeymap } from './keymap';

export function FileFilterField({
  query,
  options,
  found,
  input,
  focusName = 'files-filter',
  onQuery,
  onOptions,
  onStep,
  onLeave,
  onClose,
}: {
  query: string;
  options: SearchOptions;
  found: MatchesFound;
  input?: RefObject<HTMLInputElement | null>;
  focusName?: string;
  onQuery: (query: string) => void;
  onOptions: (options: SearchOptions) => void;
  onStep: (step: 1 | -1) => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  return (
    <SearchBar
      font="monospace"
      query={query}
      options={options}
      found={found}
      placeholder={strings.find.placeholder}
      input={input}
      focusName={focusName}
      onQuery={onQuery}
      onOptions={onOptions}
      onStep={onStep}
      onClose={onClose}
      onKeyDown={(event) => {
        if (keyPressed(gitKeymap.stopFinding, event)) {
          event.preventDefault();
          onClose();
        } else if (keyPressed(gitKeymap.toFiles, event)) {
          event.preventDefault();
          onLeave();
        }
      }}
    />
  );
}
