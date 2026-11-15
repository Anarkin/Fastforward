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

function isElement(target: EventTarget | null): target is Element {
  return target !== null && 'closest' in target;
}

function peekAt(list: HTMLElement, x: number, y: number): Peek | undefined {
  return peekOf(list, list.ownerDocument.elementFromPoint(x, y));
}

function peekOf(
  list: HTMLElement,
  target: EventTarget | null,
): Peek | undefined {
  const row = isElement(target)
    ? target.closest<HTMLElement>('.virtual-row')
    : null;
  const commit = row?.querySelector<HTMLElement>('.commit:not(.working-tree)');
  const subject = commit?.querySelector<HTMLElement>('.subject');
  if (!row || !commit || !subject || !list.contains(row)) {
    return undefined;
  }
  const text = subject.getBoundingClientRect();
  const room = list.getBoundingClientRect();
  return {
    index: Number(row.dataset.index),
    anchor: {
      left: text.left,
      top: commit.getBoundingClientRect().top,
      width: text.width,
      room: { top: room.top, bottom: room.bottom },
    },
  };
}

function withKeys(peek: Peek | undefined): Peek | undefined {
  return peek && { ...peek, byKeys: true };
}

function selectedPeek(list: HTMLElement): Peek | undefined {
  const active = list.getAttribute('aria-activedescendant');
  return active
    ? peekOf(list, list.ownerDocument.getElementById(active))
    : undefined;
}

function rowOf(
  list: HTMLElement,
  commitAt: (index: number) => CommitInfo | undefined,
  hash: string,
): Element | undefined {
  return [...list.querySelectorAll<HTMLElement>('.virtual-row')].find(
    (row) => commitAt(Number(row.dataset.index))?.hash === hash,
  );
}

const keptPinWaits = 2000;

export function MessagePeek({
  list,
  commitAt,
  indent,
  renderRow,
  keptPin,
  onPin,
}: {
  list: RefObject<HTMLElement | null>;
  commitAt: (index: number) => CommitInfo | undefined;
  indent: number;
  renderRow: (commit: CommitInfo, corner: React.ReactNode) => React.ReactNode;
  keptPin?: string;
  onPin?: (hash: string | undefined) => void;
}) {
  const holding = useRef<Holding>('none');
  const pointer = useRef<{ readonly x: number; readonly y: number }>(undefined);
  const byKeys = useRef(false);
  const [peek, setPeek] = useState<Peek>();
  const [pinned, setShownPin] = useState<{
    readonly commit: CommitInfo;
    readonly anchor: PeekAnchor;
    readonly byKey?: boolean;
  }>();
  const restoring = useRef(keptPin);
  const setPinned = useCallback(
    (next: typeof pinned) => {
      restoring.current = undefined;
      setShownPin(next);
      onPin?.(next?.commit.hash);
    },
    [onPin],
  );
  const unpin = useCallback(() => {
    if (restoring.current === undefined) {
      setPinned(undefined);
    }
  }, [setPinned]);
  useLayoutEffect(() => {
    const hash = restoring.current;
    const element = list.current;
    const row =
      hash === undefined || !element
        ? undefined
        : rowOf(element, commitAt, hash);
    if (!element || !row) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      const at = peekOf(element, row);
      const commit = at && commitAt(at.index);
      if (at && commit && restoring.current === commit.hash) {
        restoring.current = undefined;
        setShownPin({ commit, anchor: at.anchor });
      }
    });
    return () => cancelAnimationFrame(frame);
  });
  useEffect(() => {
    if (restoring.current === undefined) {
      return undefined;
    }
    const timer = setTimeout(() => {
      if (restoring.current !== undefined) {
        restoring.current = undefined;
        onPin?.(undefined);
      }
    }, keptPinWaits);
    return () => clearTimeout(timer);
  }, [onPin]);

  useBinding(gitKeymap.pin, () => {
    const element = list.current;
    const active = element?.ownerDocument.activeElement;
    if (active?.closest('.message-peek.pinned')) {
      unpin();
      return;
    }
    const at =
      element && element.contains(active ?? null)
        ? selectedPeek(element)
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
    const element = list.current;
    const at =
      element && clicked(gitKeymap.pin, event) !== undefined
        ? peekOf(element, event.target)
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
          ? withKeys(selectedPeek(element))
          : at && peekAt(element, at.x, at.y);
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
  return (
    <>
      {pinned && (
        <MessagePanel
          key={`pinned:${pinned.commit.hash}`}
          anchor={pinned.anchor}
          indent={indent}
          onUnpin={unpin}
          takesKeyboard={pinned.byKey}
        >
          {renderRow(
            pinned.commit,
            <MessageCorner onUnpin={unpin} byKeys={pinned.byKey} />,
          )}
        </MessagePanel>
      )}
      {peeked && (
        <MessagePanel
          key={peeked.commit.hash}
          anchor={peeked.anchor}
          indent={indent}
        >
          {renderRow(peeked.commit, <MessageCorner byKeys={peeked.byKeys} />)}
        </MessagePanel>
      )}
    </>
  );
}
