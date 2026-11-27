import { SearchBar } from '../../../lib/page/searchBar';
import { findKeyDown } from '../../../lib/page/findKeys';
import { strings } from '../../../lib/shared/strings';
import type { useDiffFind } from './finding';
import { diffKeymap } from './keymap';

export function DiffFindBar({
  find,
  unsearched,
}: {
  find: ReturnType<typeof useDiffFind>;
  unsearched: number;
}) {
  const { query, options, matches, shown, input, step, closeFind } = find;
  return (
    <SearchBar
      focusName="diff-find"
      font="monospace"
      query={query}
      options={options}
      found={{ current: shown, matches: matches.length }}
      countTitle={
        unsearched > 0 ? strings.find.unsearched(unsearched) : undefined
      }
      input={input}
      onQuery={find.search}
      onOptions={find.choose}
      onStep={step}
      onClose={closeFind}
      onKeyDown={findKeyDown(diffKeymap, step, closeFind)}
    />
  );
}
