import { useCallback, useContext, useMemo, type ReactNode } from 'react';
import { PathMenuContext, type PathMenuAsk } from '../../../lib/page/pathMenu';
import { useGit, useGitActions } from './store';
import { changesShown } from './shownTab';
import { fileVersions } from './fileVersions';

export function VersionedPaths({ children }: { readonly children: ReactNode }) {
  const root = useGit((state) => state.tab.root);
  const hash = useGit((state) => state.tab.hash);
  const area = useGit((state) => state.tab.area);
  const files = useGit((state) => changesShown(state.tab));
  const { viewFile } = useGitActions();
  const openMenu = useContext(PathMenuContext);
  const versionAt = useMemo(
    () =>
      root === undefined || hash === undefined
        ? undefined
        : fileVersions(root, hash, area, files),
    [root, hash, area, files],
  );
  const open = useCallback(
    (ask: PathMenuAsk) => {
      const at = ask.file ? versionAt?.(ask.path) : undefined;
      openMenu(
        at === undefined
          ? ask
          : { ...ask, version: { view: () => viewFile(at) } },
      );
    },
    [openMenu, versionAt, viewFile],
  );
  return <PathMenuContext value={open}>{children}</PathMenuContext>;
}
