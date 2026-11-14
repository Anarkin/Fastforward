import { renderToStaticMarkup as markupOf } from 'react-dom/server';
import type {
  Bookmark,
  GitToWebviewOf,
  RefInfo,
  RepositoryState,
} from '../../../../../tools/git/shared/protocol';
import { withStores } from '../../../../helpers/componentFixtures';
import { createGitStore } from '../../../../../tools/git/page/store';
import { emptyTabView } from '../../../../../tools/git/page/tabView';

export const renderToStaticMarkup = (node: React.ReactNode) =>
  markupOf(withStores(node));

export const refs: RefInfo[] = [
  { kind: 'remote', name: 'origin/feat/EPMAISA-798-drop', commit: 'a' },
  { kind: 'branch', name: 'main', commit: 'b' },
  { kind: 'tag', name: 'v0.16.4', commit: 'c' },
  { kind: 'branch', name: 'feat/epmaisa-798-drop', commit: 'a' },
  { kind: 'remote', name: 'origin/fix/typo', commit: 'd' },
];

export interface Shown {
  readonly repository?: RepositoryState;
  readonly bookmarks?: readonly Bookmark[];
  readonly commitSearch?: GitToWebviewOf<'commitSearch'>;
  readonly lookup?: GitToWebviewOf<'hashLookup'>;
  readonly query?: string;
  readonly onJump?: (commit: string) => void;
  readonly onClose?: () => void;
}

export function locationsStore({
  repository,
  bookmarks = [],
  commitSearch,
  lookup,
  query = '',
  onJump,
  onClose,
}: Shown = {}) {
  const store = createGitStore(
    (message) => {
      if (message.type === 'jump') {
        onJump?.(message.hash);
      }
    },
    {
      tab: {
        ...emptyTabView,
        root: '/repo',
        repository,
        hashLookup: lookup,
        commitSearch,
      },
      bookmarks,
      searching: true,
      searchQueries: new Map([['/repo', query]]),
    },
  );
  store.subscribe((state, before) => {
    if (before.searching && !state.searching) {
      onClose?.();
    }
  });
  return store;
}

export const repository = (
  ...named: [RefInfo['kind'], string][]
): RepositoryState => ({
  head: undefined,
  headCommit: undefined,
  refs: named.map(([kind, name]) => ({ kind, name, commit: 'c'.repeat(40) })),
  stashes: [],
});
