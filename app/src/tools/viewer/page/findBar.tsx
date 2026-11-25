import type { RefObject } from 'react';
import { SearchBar } from '../../../lib/page/searchBar';
import { findKeyDown } from '../../../lib/page/findKeys';
import { strings } from '../../../lib/shared/strings';
import type { ViewerSearch } from './find';
import { viewerKeymap } from './keymap';
import { FloatingSearch } from '../../../lib/page/floatingSearch';

export function ViewerFindBar({
  searched,
  inPdf,
  proportional,
  input,
  onClose,
}: {
  searched: ViewerSearch;
  inPdf: boolean;
  proportional: boolean;
  input: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}) {
  return (
    <FloatingSearch below>
      <SearchBar
        font={proportional ? 'proportional' : 'monospace'}
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
    </FloatingSearch>
  );
}
