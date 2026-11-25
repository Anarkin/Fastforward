import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { clicked, pressed } from '../../../lib/shared/keymap';
import { gitKeymap } from './keymap';
import type { CommitInfo } from '../shared/protocol';
import { useBinding } from '../../../lib/page/shortcuts';
import {
  type Holding,
  holdingAfterKey,
  holdingAfterPointer,
  type PeekAnchor,
} from './messageHolding';
import { MessageCorner, MessagePanel } from './messagePanel';
import type { KeptPin } from './state';
import { rowAt, type RowHit } from './commitHits';

interface Peek {
  readonly index: number;
  readonly anchor: PeekAnchor;
  readonly byKeys?: boolean;
}

function samePeek(shown: Peek | undefined, next: Peek | undefined): boolean {
  if (shown === undefined || next === undefined) {
    return shown === next;
  }
  const [a, b] = [shown.anchor, next.anchor];
  return (
    shown.index === next.index &&
    shown.byKeys === next.byKeys &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.room.top === b.room.top &&
    a.room.bottom === b.room.bottom
  );
}

interface Rows {
  readonly list: HTMLElement;
  readonly spacer: HTMLElement;
  readonly hits: readonly RowHit[];
}

function peekOfRow(
  rows: Rows | undefined,
  row: RowHit | undefined,
): Peek | undefined {
  if (rows === undefined || row === undefined) {
    return undefined;
  }
  const origin = rows.spacer.getBoundingClientRect();
  const room = rows.list.getBoundingClientRect();
  return {
    index: row.index,
    anchor: {
      left: origin.left + row.subjectLeft,
      top: origin.top + row.top,
      width: row.subjectWidth,
      room: { top: room.top, bottom: room.bottom },
    },
  };
}

function peekAt(
  rows: Rows | undefined,
  x: number,
  y: number,
): Peek | undefined {
  if (rows === undefined) {
    return undefined;
  }
  const origin = rows.spacer.getBoundingClientRect();
  const room = rows.list.getBoundingClientRect();
  return x < room.left || x >= room.right || y < room.top || y >= room.bottom
    ? undefined
    : peekOfRow(rows, rowAt(rows.hits, y - origin.top));
}

function withKeys(peek: Peek | undefined): Peek | undefined {
  return peek && { ...peek, byKeys: true };
}

const keptPinWaits = 2000;

export function MessagePeek({
  list,
  spacer,
  hits,
  selectedRow,
  commitAt,
  indent,
  renderRow,
  keptPin,
  onPin,
}: {
  list: RefObject<HTMLElement | null>;
  spacer: RefObject<HTMLElement | null>;
  hits: { current: readonly RowHit[] };
  selectedRow: () => RowHit | undefined;
  commitAt: (index: number) => CommitInfo | undefined;
  indent: number;
  renderRow: (commit: CommitInfo, corner: React.ReactNode) => React.ReactNode;
  keptPin?: KeptPin;
  onPin?: (pin: KeptPin | undefined) => void;
}) {
  const rowsOf = (): Rows | undefined =>
    list.current && spacer.current
      ? { list: list.current, spacer: spacer.current, hits: hits.current }
      : undefined;
  const holding = useRef<Holding>('none');
  const pointer = useRef<{ readonly x: number; readonly y: number }>(undefined);
  const byKeys = useRef(false);
  const [peek, setPeek] = useState<Peek>();
  const [placed, setPlaced] = useState<{
    readonly commit: CommitInfo;
    readonly anchor: PeekAnchor;
    readonly restored?: boolean;
  }>();
  const pinned =
    keptPin !== undefined && placed?.commit.hash === keptPin.hash
      ? { ...placed, byKey: keptPin.byKey }
      : undefined;
  const restoring = keptPin !== undefined && pinned === undefined;
  const restoringNow = useRef(restoring);
  useLayoutEffect(() => {
    restoringNow.current = restoring;
  });
  const setPinned = useCallback(
    (
      next:
        | {
            readonly commit: CommitInfo;
            readonly anchor: PeekAnchor;
            readonly byKey?: boolean;
          }
        | undefined,
    ) => {
      restoringNow.current = false;
      setPlaced(next && { commit: next.commit, anchor: next.anchor });
      onPin?.(next && { hash: next.commit.hash, byKey: next.byKey === true });
    },
    [onPin],
  );
  const unpin = useCallback(() => {
    if (!restoringNow.current) {
      setPinned(undefined);
    }
  }, [setPinned]);
  useLayoutEffect(() => {
    const rows = rowsOf();
    const hash = restoring ? keptPin?.hash : undefined;
    const row =
      hash === undefined || !rows
        ? undefined
        : rows.hits.find((each) => commitAt(each.index)?.hash === hash);
    if (!rows || !row) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      const at = peekOfRow(rows, row);
      const commit = at && commitAt(at.index);
      if (at && commit && commit.hash === hash) {
        setPlaced({ commit, anchor: at.anchor, restored: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  });
  useEffect(() => {
    if (!restoring) {
      return undefined;
    }
    const timer = setTimeout(() => onPin?.(undefined), keptPinWaits);
    return () => clearTimeout(timer);
  }, [restoring, onPin]);

  useBinding(gitKeymap.pin, () => {
    const element = list.current;
    const active = element?.ownerDocument.activeElement;
    if (active?.closest('.message-peek.pinned')) {
      unpin();
      return;
    }
    const at =
      element && element.contains(active ?? null)
        ? peekOfRow(rowsOf(), selectedRow())
        : undefined;
    const commit = at && commitAt(at.index);
    if (!at || !commit) {
      return;
    }
    setPinned(
      pinned?.commit.hash === commit.hash
        ? undefined
        : { commit, anchor: at.anchor, byKey: true },
    );
  });

  const pin = useEffectEvent((event: MouseEvent) => {
    const rows = rowsOf();
    const at =
      rows && clicked(gitKeymap.pin, event) !== undefined
        ? peekAt(rows, event.clientX, event.clientY)
        : undefined;
    const commit = at && commitAt(at.index);
    if (!at || !commit) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPinned({ commit, anchor: at.anchor });
  });

  const look = useEffectEvent(() => {
    const element = list.current;
    const at = pointer.current;
    const next =
      holding.current !== 'held' || !element
        ? undefined
        : byKeys.current &&
            element.contains(element.ownerDocument.activeElement)
          ? withKeys(peekOfRow(rowsOf(), selectedRow()))
          : at && peekAt(rowsOf(), at.x, at.y);
    setPeek((shown) => (samePeek(shown, next) ? shown : next));
  });

  useEffect(() => {
    const key = (down: boolean) => (event: KeyboardEvent) => {
      const was = holding.current;
      holding.current = holdingAfterKey(was, event, down);
      if (holding.current !== 'held') {
        byKeys.current = false;
      }
      const element = list.current;
      const stepped = pressed(gitKeymap.peekStep, event, false) !== undefined;
      const started = was !== 'held' && pointer.current === undefined;
      if (
        down &&
        holding.current === 'held' &&
        (stepped || started) &&
        element?.contains(element.ownerDocument.activeElement)
      ) {
        byKeys.current = true;
      }
      look();
    };
    const keyDown = key(true);
    const keyUp = key(false);
    const blurred = () => {
      holding.current = 'none';
      byKeys.current = false;
      look();
    };
    window.addEventListener('keydown', keyDown, { capture: true });
    window.addEventListener('keyup', keyUp, { capture: true });
    window.addEventListener('blur', blurred);
    return () => {
      window.removeEventListener('keydown', keyDown, { capture: true });
      window.removeEventListener('keyup', keyUp, { capture: true });
      window.removeEventListener('blur', blurred);
    };
  }, [list]);

  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    const moved = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      byKeys.current = false;
      const was = holding.current;
      holding.current = holdingAfterPointer(was, event);
      if (was === 'held' || holding.current === 'held') {
        look();
      }
    };
    const left = () => {
      pointer.current = undefined;
      look();
    };
    const scrolled = () => {
      unpin();
      if (holding.current === 'held') {
        look();
      }
    };
    const clickedRow = (event: MouseEvent) => pin(event);
    element.addEventListener('pointermove', moved);
    element.addEventListener('pointerleave', left);
    element.addEventListener('scroll', scrolled);
    element.addEventListener('click', clickedRow, { capture: true });
    return () => {
      element.removeEventListener('pointermove', moved);
      element.removeEventListener('pointerleave', left);
      element.removeEventListener('scroll', scrolled);
      element.removeEventListener('click', clickedRow, { capture: true });
    };
  }, [list, unpin]);

  useLayoutEffect(() => {
    if (holding.current === 'held') {
      look();
    }
  });

  const commit = peek && commitAt(peek.index);
  const peeked =
    commit && commit.hash !== pinned?.commit.hash
      ? { commit, anchor: peek.anchor, byKeys: peek.byKeys }
      : undefined;
  const peeking = peeked !== undefined;
  useLayoutEffect(() => {
    document.body.classList.toggle('peeking', peeking);
    return () => document.body.classList.remove('peeking');
  }, [peeking]);
  return (
    <>
      {pinned && (
        <MessagePanel
          key={`pinned:${pinned.commit.hash}`}
          anchor={pinned.anchor}
          indent={indent}
          onUnpin={unpin}
          takesKeyboard={pinned.byKey && pinned.restored !== true}
        >
          {renderRow(pinned.commit, <MessageCorner onUnpin={unpin} />)}
        </MessagePanel>
      )}
      {peeked && (
        <MessagePanel
          key={peeked.commit.hash}
          anchor={peeked.anchor}
          indent={indent}
        >
          {renderRow(peeked.commit, <MessageCorner />)}
        </MessagePanel>
      )}
    </>
  );
}
