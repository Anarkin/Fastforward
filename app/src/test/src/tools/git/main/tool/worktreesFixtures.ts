import * as assert from 'node:assert';
import * as fs from 'node:fs';
import type { GitToWebviewOf } from '../../../../../../tools/git/shared/protocol';
import { type OpenView, shownTabs } from '../../../../../helpers/harness';

export function sameRealFolder(a: string | undefined, b: string): boolean {
  return (
    a !== undefined &&
    fs.existsSync(a) &&
    fs.realpathSync.native(a) === fs.realpathSync.native(b)
  );
}

export function worktreesOf(
  view: OpenView,
): NonNullable<GitToWebviewOf<'worktrees'>['worktrees']> {
  return shownTabs(view.page)?.worktrees ?? [];
}

export function worktreeRoot(view: OpenView, root: string): string {
  const found = worktreesOf(view).find((worktree) =>
    sameRealFolder(worktree.root, root),
  );
  assert.ok(found, root);
  return found.root;
}
