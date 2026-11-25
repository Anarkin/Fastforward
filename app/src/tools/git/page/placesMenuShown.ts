import { useBinding } from '../../../lib/page/shortcuts';
import { useShellActions } from '../../../shell/page/store';
import type { RefInfo, StashInfo } from '../shared/protocol';
import { gitKeymap } from './keymap';
import { placesMenu } from './placesMenu';
import { useGit, useGitActions } from './store';

const noRefs: readonly RefInfo[] = [];

const noStashes: readonly StashInfo[] = [];

export function usePlacesMenu(
  list: React.RefObject<HTMLElement | null>,
  active: boolean,
): void {
  const bookmarks = useGit((state) => state.bookmarks);
  const refs = useGit((state) => state.tab.repository?.refs ?? noRefs);
  const stashes = useGit((state) => state.tab.repository?.stashes ?? noStashes);
  const groups = useGit((state) => state.refIndex);
  const { showMenu } = useShellActions();
  const { jump } = useGitActions();
  useBinding(
    gitKeymap.places,
    () => {
      const title = list.current
        ?.closest('.column')
        ?.querySelector('.column-title')
        ?.getBoundingClientRect();
      if (title === undefined) {
        return;
      }
      showMenu({
        x: title.left,
        y: title.bottom,
        items: placesMenu({ bookmarks, refs, groups, stashes }, jump),
      });
    },
    active,
  );
}
