import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  hovered,
  keymap,
  modifierKey,
  type KeyPress,
  type Modifiers,
} from '../shared/keymap';
import type { CommitInfo } from '../shared/protocol';

export type Holding = 'none' | 'held' | 'spoiled';

export function holdingAfterKey(
  holding: Holding,
  press: KeyPress,
  down: boolean,
): Holding {
  if (hovered(keymap.message, press) === undefined) {
    return 'none';
  }
  if (down && !modifierKey(press)) {
    return 'spoiled';
  }
  return holding === 'spoiled' ? 'spoiled' : 'held';
}

export function holdingAfterPointer(
  holding: Holding,
  pointer: Modifiers,
): Holding {
  if (hovered(keymap.message, pointer) === undefined) {
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
  readonly truncated: boolean;
  readonly room: Span;
}

interface Peek {
  readonly index: number;
  readonly anchor: PeekAnchor;
}

export function showsMore(commit: CommitInfo, truncated: boolean): boolean {
  return truncated || commit.body !== '';
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
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.truncated === b.truncated &&
    a.room.top === b.room.top &&
    a.room.bottom === b.room.bottom
  );
}

function peekAt(list: HTMLElement, x: number, y: number): Peek | undefined {
  const row = list.ownerDocument
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>('.virtual-row');
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
      truncated: subject.scrollWidth > subject.clientWidth,
      room: { top: room.top, bottom: room.bottom },
    },
  };
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
  renderRow: (commit: CommitInfo) => React.ReactNode;
}) {
  const holding = useRef<Holding>('none');
  const pointer = useRef<{ readonly x: number; readonly y: number }>(undefined);
  const [peek, setPeek] = useState<Peek>();

  const look = useEffectEvent(() => {
    const element = list.current;
    const at = pointer.current;
    const next =
      holding.current === 'held' && element && at
        ? peekAt(element, at.x, at.y)
        : undefined;
    setPeek((shown) => (samePeek(shown, next) ? shown : next));
  });

  useEffect(() => {
    const key = (down: boolean) => (event: KeyboardEvent) => {
      holding.current = holdingAfterKey(holding.current, event, down);
      look();
    };
    const pressed = key(true);
    const released = key(false);
    const blurred = () => {
      holding.current = 'none';
      look();
    };
    window.addEventListener('keydown', pressed);
    window.addEventListener('keyup', released);
    window.addEventListener('blur', blurred);
    return () => {
      window.removeEventListener('keydown', pressed);
      window.removeEventListener('keyup', released);
      window.removeEventListener('blur', blurred);
    };
  }, []);

  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    const moved = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
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
      if (holding.current === 'held') {
        look();
      }
    };
    element.addEventListener('pointermove', moved);
    element.addEventListener('pointerleave', left);
    element.addEventListener('scroll', scrolled);
    return () => {
      element.removeEventListener('pointermove', moved);
      element.removeEventListener('pointerleave', left);
      element.removeEventListener('scroll', scrolled);
    };
  }, [list]);

  useLayoutEffect(() => {
    if (holding.current === 'held') {
      look();
    }
  });

  const commit = peek && commitAt(peek.index);
  return commit && showsMore(commit, peek.anchor.truncated) ? (
    <MessagePanel key={commit.hash} anchor={peek.anchor} indent={indent}>
      {renderRow(commit)}
    </MessagePanel>
  ) : null;
}

export function MessagePanel({
  anchor,
  indent,
  children,
}: {
  anchor: PeekAnchor;
  indent: number;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [lifted, setLifted] = useState(0);
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
      className="message-peek"
      role="tooltip"
      style={{
        left: anchor.left - indent,
        top: anchor.top - lifted,
        maxHeight: anchor.room.bottom - anchor.room.top,
        '--peek-row-width': `${anchor.width}px`,
      }}
    >
      {children}
    </div>
  );
}

export function MessageBody({ text }: { text: string }) {
  return text === '' ? null : <div className="message-body">{text}</div>;
}

declare module 'react' {
  interface CSSProperties {
    readonly '--peek-row-width'?: string;
  }
}
