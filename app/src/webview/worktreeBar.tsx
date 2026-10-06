import { useEffect, useMemo } from 'react';
import { type WorktreeInfo } from '../shared/protocol';
import { HomeIcon } from './icons';
import { worktreeStep, useWindowKeyDown } from './shortcuts';
import { adjacentTab, preloadDelay, resting } from './tabBar';

export function adjacentWorktree(
  worktrees: readonly WorktreeInfo[],
  active: string | undefined,
  step: 1 | -1,
): string | undefined {
  return adjacentTab(
    worktrees.filter(
      (worktree) => !worktree.missing || worktree.root === active,
    ),
    active,
    step,
  );
}

export function WorktreeBar({
  worktrees,
  active,
  onSelect,
  onPreload,
}: {
  worktrees: readonly WorktreeInfo[];
  active: string | undefined;
  onSelect: (root: string) => void;
  onPreload: (root: string) => void;
}) {
  const rest = useMemo(() => resting(preloadDelay), []);
  useEffect(() => rest.cancel, [rest]);

  useWindowKeyDown((event) => {
    const step = worktreeStep(event);
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    const root = adjacentWorktree(worktrees, active, step);
    if (root !== undefined) {
      onSelect(root);
    }
  });

  return (
    <nav className="worktrees">
      <div className="tab-list">
        {worktrees.map((worktree) => (
          <div
            key={worktree.root}
            className={`tab ${worktree.root === active ? 'active' : ''} ${worktree.missing ? 'missing' : ''}`}
            title={
              worktree.missing
                ? `${worktree.root} doesn't exist anymore`
                : worktree.root
            }
            onClick={
              worktree.missing
                ? undefined
                : () => {
                    rest.cancel();
                    onSelect(worktree.root);
                  }
            }
            onPointerEnter={() =>
              !worktree.missing &&
              worktree.root !== active &&
              rest.start(() => onPreload(worktree.root))
            }
            onPointerLeave={rest.cancel}
          >
            {worktree.main && <HomeIcon />}
            <span className="tab-name">{worktree.name}</span>
            {!worktree.main && worktree.folder !== worktree.name && (
              <span className="tab-folder">{worktree.folder}</span>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
