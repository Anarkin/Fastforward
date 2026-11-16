import type {
  GitToHost,
  GitToWebviewOf,
  WorktreeInfo,
} from '../../../../../tools/git/shared/protocol';
import { createGitStore } from '../../../../../tools/git/page/store';
import type { ToHost } from '../../../../../shell/shared/protocol';
import { pageViews } from '../../../../../shell/page/toolViews';
import type { ContextMenuItem } from '../../../../../lib/page/contextMenuItem';

export const at = 'a'.repeat(40);

export const worktree = (root: string, name: string): WorktreeInfo => ({
  root,
  name,
  folder: root,
  main: root === '/repo',
  missing: false,
});

export const shown = (
  worktrees: readonly WorktreeInfo[] = [],
  root = '/repo',
  tab = '1',
): GitToWebviewOf<'worktrees'> => ({
  type: 'worktrees',
  tab,
  worktree: root,
  worktrees,
});

export const layout = (
  hideDimmedButtons: boolean,
): GitToWebviewOf<'layout'> => ({
  type: 'layout',
  columnWidths: [],
  defaultColumnWidths: [],
  collapseMerges: true,
  showEntireFile: true,
  ignoreWhitespace: true,
  diffLayout: 'sideBySide',
  showAllFiles: false,
  autoFetch: true,
  autoFetchMinutes: 1,
  hideDimmedButtons,
});

export const labelled = (items: readonly ContextMenuItem[] | undefined) =>
  (items ?? []).map((item) => ('separator' in item ? '-' : item.label));

export const compare = (tab: string, version = 1) => ({
  tab,
  old: '/a.txt',
  new: '/b.txt',
  name: 'b.txt',
  patch: '',
  version,
  entire: true,
});

export function posting() {
  const posted: GitToHost[] = [];
  const shell: ToHost[] = [];
  const views = pageViews((message) => shell.push(message));
  const store = createGitStore(
    (message) => posted.push(message),
    {},
    views.views,
  );
  views.views.onRelease(store.getState().releaseTab);
  return { posted, shell, views, store };
}
