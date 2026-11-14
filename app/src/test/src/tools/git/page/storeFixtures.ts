import type {
  GitToHost,
  GitToWebviewOf,
  WorktreeInfo,
} from '../../../../../tools/git/shared/protocol';
import { createGitStore } from '../../../../../tools/git/page/store';
import type { ContextMenuItem } from '../../../../../lib/page/menuControls';

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
): GitToWebviewOf<'worktrees'> => ({
  type: 'worktrees',
  worktree: '/repo',
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
  return { posted, store: createGitStore((message) => posted.push(message)) };
}
