import { SearchBar } from '../../../lib/page/searchBar';
import { findKeyDown } from '../../../lib/page/findKeys';
import { strings } from '../../../lib/shared/strings';
import type { useDiffFind } from './diffFind';
import { gitKeymap } from './keymap';

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
      font="monospace"
      query={query}
      options={options}
      found={{ current: shown, matches: matches.length }}
      countTitle={
        unsearched > 0 ? strings.find.unsearched(unsearched) : undefined
      }
      input={input}
      onQuery={(next) => {
        find.setQuery(next);
        find.goTo(0);
      }}
      onOptions={(next) => {
        find.setOptions(next);
        find.goTo(0);
      }}
      onStep={step}
      onClose={closeFind}
      onKeyDown={findKeyDown(gitKeymap, step, closeFind)}
    />
  );
}
