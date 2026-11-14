import { type WorktreeInfo } from '../shared/protocol';
import { adjacentTab } from '../../../shell/page/tabStrip';

export function adjacentWorktree(
  worktrees: readonly WorktreeInfo[],
  active: string | undefined,
  step: 1 | -1,
): string | undefined {
  return adjacentTab(
    worktrees
      .filter((worktree) => !worktree.missing || worktree.root === active)
      .map((worktree) => ({ id: worktree.root })),
    active,
    step,
  );
}
