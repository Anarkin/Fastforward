import type { RefObject } from 'react';
import { SearchBar } from '../../../lib/page/searchBar';
import { findKeyDown } from '../../../lib/page/findKeys';
import { strings } from '../../../lib/shared/strings';
import type { ViewerSearch } from './viewerFind';
import { viewerKeymap } from './viewerKeymap';

export function ViewerFindBar({
  searched,
  inPdf,
  input,
  onClose,
}: {
  searched: ViewerSearch;
  inPdf: boolean;
  input: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}) {
  return (
    <header className="column-title searching">
      <SearchBar
        query={searched.query}
        options={searched.options}
        found={searched.found}
        input={input}
        noRegex={inPdf ? strings.find.noRegexInPdf : undefined}
        onQuery={searched.search}
        onOptions={searched.choose}
        onStep={searched.step}
        onClose={onClose}
        onKeyDown={findKeyDown(viewerKeymap, searched.step, onClose)}
      />
    </header>
  );
}
