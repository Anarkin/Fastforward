import { useEffect, useMemo, useState } from 'react';
import { type WorktreeInfo } from '../shared/protocol';
import { useSkeleton } from './skeleton';
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
  const skeleton = useSkeleton(worktrees === undefined);
  const rest = useMemo(() => resting(preloadDelay), []);
  useEffect(() => rest.cancel, [rest]);

  const [cycle] = useState(() => new Cycle());
  useBinding(keymap.worktree, (step) => {
    const root = cycle.next(active, (from) =>
      adjacentWorktree(worktrees ?? [], from, step),
    );
    if (root !== undefined) {
      onSelect(root);
    }
  });

  return (
    <nav className="worktrees">
      <div className="tab-list">
        {worktrees === undefined && (
          <div
            className={`tab skeleton-tab ${skeleton ? '' : 'waiting'}`}
            aria-busy="true"
          >
            <span className="bar" />
          </div>
        )}
        {worktrees?.map((worktree) => (
          <div
            key={worktree.root}
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
