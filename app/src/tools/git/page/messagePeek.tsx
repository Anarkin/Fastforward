import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  clicked,
  hovered,
  modifierKey,
  pressed,
  shortcutOf,
  type KeyPress,
  type Modifiers,
} from '../../../shell/shared/keymap';
import { gitKeymap } from '../shared/keymap';
import type { CommitInfo } from '../shared/protocol';
import { strings } from '../../../shared/strings';
import { listenForDismiss } from '../../../ui/contextMenu';
import { CloseIcon, PinIcon } from '../../../ui/icons';
import { useBinding } from '../../../ui/shortcuts';
import { KeyCombo } from '../../../shell/page/shortcutsPopup';

export type Holding = 'none' | 'held' | 'spoiled';

export function holdingAfterKey(
  holding: Holding,
  press: KeyPress,
  down: boolean,
): Holding {
  if (hovered(gitKeymap.message, press) === undefined) {
    return 'none';
  }
  if (
    down &&
    !modifierKey(press) &&
    pressed(gitKeymap.peekStep, press, false) === undefined
  ) {
    return 'spoiled';
  }
  return holding === 'spoiled' ? 'spoiled' : 'held';
}

export function holdingAfterPointer(
  holding: Holding,
  pointer: Modifiers,
): Holding {
  if (hovered(gitKeymap.message, pointer) === undefined) {
    return 'none';
  }
  return holding === 'none' ? 'held' : holding;
}

interface Span {
  readonly top: number;
  readonly bottom: number;
}

export interface PeekAnchor {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly room: Span;
}

interface Peek {
  readonly index: number;
  readonly anchor: PeekAnchor;
  readonly byKeys?: boolean;
}

export function liftOf(box: Span, room: Span): number {
  return Math.max(0, Math.min(box.bottom - room.bottom, box.top - room.top));
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

export function MessagePeek({
  list,
  commitAt,
  indent,
  renderRow,
}: {
  list: RefObject<HTMLElement | null>;
  commitAt: (index: number) => CommitInfo | undefined;
  indent: number;
  renderRow: (commit: CommitInfo, corner: React.ReactNode) => React.ReactNode;
}) {
  const holding = useRef<Holding>('none');
  const pointer = useRef<{ readonly x: number; readonly y: number }>(undefined);
  const byKeys = useRef(false);
  const [peek, setPeek] = useState<Peek>();
  const [pinned, setPinned] = useState<{
    readonly commit: CommitInfo;
    readonly anchor: PeekAnchor;
    readonly byKey?: boolean;
  }>();
  const unpin = useCallback(() => setPinned(undefined), []);

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
    setPinned((shown) =>
      shown?.commit.hash === commit.hash
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

export function MessagePanel({
  anchor,
  indent,
  onUnpin,
  takesKeyboard = false,
  children,
}: {
  anchor: PeekAnchor;
  indent: number;
  onUnpin?: () => void;
  takesKeyboard?: boolean;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [lifted, setLifted] = useState(0);
  useEffect(
    () => (onUnpin ? listenForDismiss(window, panel, onUnpin) : undefined),
    [onUnpin],
  );
  useEffect(() => {
    const element = panel.current;
    if (!takesKeyboard || !element) {
      return undefined;
    }
    const previous = element.ownerDocument.activeElement;
    const scroller =
      element.querySelector<HTMLElement>('.message-body') ?? element;
    scroller.focus({ preventScroll: true });
    return () => {
      const active = element.ownerDocument.activeElement;
      if (
        previous instanceof HTMLElement &&
        (active === null ||
          active === element.ownerDocument.body ||
          element.contains(active))
      ) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [takesKeyboard]);
  useLayoutEffect(() => {
    const box = panel.current?.getBoundingClientRect();
    if (box) {
      setLifted(
        liftOf(
          { top: box.top + lifted, bottom: box.bottom + lifted },
          anchor.room,
        ),
      );
    }
  }, [anchor, lifted]);
  return (
    <div
      ref={panel}
      className={onUnpin ? 'message-peek pinned' : 'message-peek'}
      role="tooltip"
      tabIndex={-1}
      style={{
        left: anchor.left - indent,
        top: anchor.top - lifted,
        maxHeight: anchor.room.bottom - anchor.room.top,
        '--peek-row-width': `${anchor.width}px`,
      }}
      onClickCapture={(event) => {
        if (onUnpin && clicked(gitKeymap.pin, event) !== undefined) {
          event.stopPropagation();
          onUnpin();
        }
      }}
    >
      {children}
    </div>
  );
}

export function MessageCorner({
  onUnpin,
  byKeys = false,
}: {
  onUnpin?: () => void;
  byKeys?: boolean;
}) {
  const keys = shortcutOf(gitKeymap.pin, byKeys ? 'keyboard' : 'pointer') ?? '';
  return (
    <span className={onUnpin ? 'message-corner pinned' : 'message-corner'}>
      <span className="message-hint">
        <PinIcon />
        <KeyCombo keys={keys} />
      </span>
      <button
        className="message-close"
        title={strings.common.close}
        disabled={!onUnpin}
        onClick={onUnpin}
      >
        <CloseIcon />
      </button>
    </span>
  );
}

export function hiddenLines(
  scrollHeight: number,
  clientHeight: number,
  lineHeight: number,
): number {
  return lineHeight > 0
    ? Math.max(0, Math.ceil((scrollHeight - clientHeight - 1) / lineHeight))
    : 0;
}

export function MessageBody({ text }: { text: string }) {
  const body = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(0);
  useLayoutEffect(() => {
    const element = body.current;
    const style = element?.ownerDocument.defaultView?.getComputedStyle(element);
    setHidden(
      element && style?.overflowY === 'hidden'
        ? hiddenLines(
            element.scrollHeight,
            element.clientHeight,
            parseFloat(style.lineHeight),
          )
        : 0,
    );
  }, []);
  if (text === '') {
    return null;
  }
  return (
    <>
      <div ref={body} className="message-body" tabIndex={-1}>
        {text}
      </div>
      {hidden > 0 && (
        <div className="message-more">{strings.commits.moreLines(hidden)}</div>
      )}
    </>
  );
}

declare module 'react' {
  interface CSSProperties {
    readonly '--peek-row-width'?: string;
  }
}
