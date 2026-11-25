import { useEffect, useEffectEvent, useState } from 'react';
import { type TipProps } from '../../../lib/page/tips';
import { type GraphRow } from '../shared/protocol';
import { isCompareClick } from './commitListItems';
import {
  clickOf,
  hitAt,
  hitKey,
  type Box,
  type Hit,
  type RowHit,
} from './commitHits';
import { useOpenMenu } from './menus';
import { useGit, useGitActions } from './store';
import { boxOf, menuOf, tipOf } from './commitTips';

export interface Tipped {
  readonly key: string;
  readonly box: Box;
  readonly said: TipProps;
}

export function useCommitPointer({
  list,
  spacer,
  hits,
  hashOf,
  graphOf,
  stashes,
}: {
  list: React.RefObject<HTMLElement | null>;
  spacer: React.RefObject<HTMLElement | null>;
  hits: { current: readonly RowHit[] };
  hashOf: (index: number) => string | undefined;
  graphOf: (index: number) => GraphRow | undefined;
  stashes: ReadonlySet<string>;
}) {
  const openMenu = useOpenMenu();
  const tagRemote = useGit((state) => state.tab.repository?.tagRemote);
  const {
    selectCommit,
    compareCommit,
    toggleMerge,
    pull,
    push,
    pullBranch,
    pushBranch,
    pushTag,
  } = useGitActions();
  const [tipped, setTipped] = useState<Tipped>();

  const hitOf = (event: { clientX: number; clientY: number }) => {
    const box = spacer.current?.getBoundingClientRect();
    return box === undefined
      ? undefined
      : hitAt(hits.current, event.clientX - box.left, event.clientY - box.top);
  };

  const moved = useEffectEvent((event: PointerEvent) => {
    const hit = hitOf(event);
    const key = hitKey(hit);
    setTipped((shown) =>
      shown?.key === key
        ? shown
        : hit === undefined || key === undefined
          ? undefined
          : {
              key,
              box: boxOf(hit),
              said: tipOf(
                hit,
                hashOf(hit.row.index),
                graphOf(hit.row.index),
                tagRemote,
              ),
            },
    );
  });

  useEffect(() => {
    const element = list.current;
    if (element === null) {
      return undefined;
    }
    const left = () => setTipped(undefined);
    element.addEventListener('pointermove', moved);
    element.addEventListener('pointerleave', left);
    element.addEventListener('scroll', left);
    return () => {
      element.removeEventListener('pointermove', moved);
      element.removeEventListener('pointerleave', left);
      element.removeEventListener('scroll', left);
    };
  }, [list]);

  const act = (hit: Extract<Hit, { kind: 'action' }>) => {
    const { look, checkedOut, running } = hit.bubble.bubble;
    const key = hit.action.key;
    if (running.includes(key)) {
      return;
    }
    if (look.kind === 'tag') {
      pushTag(look.text);
    } else if (checkedOut) {
      (key === 'pull' ? pull : push)();
    } else {
      (key === 'pull' ? pullBranch : pushBranch)(look.text);
    }
  };

  const onClick = (event: React.MouseEvent) => {
    const hit = hitOf(event);
    const clicked = clickOf(
      hit,
      hit && hashOf(hit.row.index),
      isCompareClick(event),
    );
    if (clicked?.kind === 'action') {
      act(clicked.hit);
    } else if (clicked?.kind === 'merge') {
      toggleMerge(clicked.hash);
    } else if (clicked?.kind === 'compare') {
      compareCommit(clicked.hash);
    } else if (clicked?.kind === 'select') {
      selectCommit(clicked.hash);
    }
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (hitOf(event)?.kind === 'action') {
      event.preventDefault();
    }
  };

  const onContextMenu = (event: React.MouseEvent): boolean => {
    const hit = hitOf(event);
    const target = menuOf(hit, hit && hashOf(hit.row.index), stashes);
    if (target !== undefined) {
      openMenu(event, target);
    }
    return target !== undefined;
  };

  return {
    onClick,
    onPointerDown,
    onContextMenu,
    tipped,
  };
}
