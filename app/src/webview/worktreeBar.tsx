import { useEffect, useMemo, useState } from 'react';
import { type WorktreeInfo } from '../shared/protocol';
import { keymap } from '../shared/keymap';
import { strings } from '../shared/strings';
import { useBinding } from './shortcuts';
import { adjacentTab, Cycle, preloadDelay, resting } from './tabBar';

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
  worktrees: readonly WorktreeInfo[] | undefined;
  active: string | undefined;
  onSelect: (root: string) => void;
  onPreload: (root: string) => void;
}) {
  const rest = useMemo(() => resting(preloadDelay), []);
  useEffect(() => rest.cancel, [rest]);

  const [cycle] = useState(() => new Cycle());
  useEffect(() => cycle.seen(active), [cycle, active]);
  useBinding(keymap.worktree, (step) => {
    const root = cycle.next(active, (from) =>
      adjacentWorktree(worktrees ?? [], from, step),
    );
    if (root !== undefined) {
      onSelect(root);
    }
  });

  if (worktrees === undefined || worktrees.length < 2) {
    return null;
  }

  return (
    <nav className="worktrees">
      <div
        className="tab-list"
        role="tablist"
        aria-label={strings.tabs.worktrees}
      >
        {worktrees.map((worktree) => (
          <div
            key={worktree.root}
            role="tab"
            aria-selected={worktree.root === active}
            aria-disabled={worktree.missing || undefined}
            className={`tab ${worktree.root === active ? 'active' : ''} ${worktree.missing ? 'missing' : ''}`}
            title={
              worktree.missing
                ? strings.common.gone(worktree.root)
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
