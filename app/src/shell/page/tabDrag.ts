import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { type TabInfo } from '../shared/protocol';
import { tabMagnetism } from '../shared/titleBar';
import { shellKeymap } from '../shared/keymap';
import { clicked, keymap, released } from '../../lib/shared/keymap';
import { keyPressed } from '../../lib/page/shortcuts';
import { type ScreenPoint } from './store';

export function slotLefts(
  widths: readonly number[],
  gap: number,
  dragged: number,
): number[] {
  const lefts: number[] = [];
  let left = 0;
  for (const width of [...widths.toSpliced(dragged, 1), 0]) {
    lefts.push(left);
    left += width + gap;
  }
  return lefts;
}

export function nearestSlot(lefts: readonly number[], left: number): number {
  let nearest = 0;
  lefts.forEach((slot, index) => {
    if (Math.abs(slot - left) < Math.abs(lefts[nearest] - left)) {
      nearest = index;
    }
  });
  return nearest;
}

export function movedTab<T extends { readonly id: string }>(
  tabs: readonly T[],
  id: string,
  index: number,
): readonly T[] {
  const from = tabs.findIndex((tab) => tab.id === id);
  return from === -1
    ? tabs
    : tabs.toSpliced(from, 1).toSpliced(index, 0, tabs[from]);
}

const dragDistance = 4;

export interface Press {
  readonly id: string;
  readonly pointer: number;
  readonly x: number;
  readonly y: number;
  readonly grab: ScreenPoint;
  readonly scrolled: number;
  order: readonly string[];
  start?: number;
  remote?: true;
}

export interface Tearing {
  readonly tear: (id: string, grab: ScreenPoint, at: ScreenPoint) => void;
  readonly to: (at: ScreenPoint) => void;
  readonly drop: () => void;
  readonly cancel: () => void;
}

export function tornOut(
  row: { readonly top: number; readonly bottom: number },
  y: number,
): boolean {
  return y < row.top - tabMagnetism || y > row.bottom + tabMagnetism;
}

export function visitedSlot(
  widths: readonly number[],
  gap: number,
  left: number,
): { readonly index: number; readonly shift: number } {
  const lefts = slotLefts([...widths, 0], gap, widths.length);
  const clamped = Math.min(Math.max(left, 0), lefts.at(-1) ?? 0);
  const index = nearestSlot(lefts, clamped);
  return { index, shift: clamped - (lefts[index] ?? 0) };
}

export interface Drag {
  readonly id: string;
  readonly order: readonly string[];
}

export function slide(element: HTMLElement, from: number | undefined): void {
  element.style.transition = 'none';
  element.style.transform = '';
  const shift =
    from === undefined ? 0 : from - element.getBoundingClientRect().left;
  if (Math.abs(shift) >= 0.5) {
    element.style.transform = `translateX(${shift}px)`;
    element.getBoundingClientRect();
    element.style.transform = '';
  }
  element.style.transition = '';
}

function leftsOf(
  elements: ReadonlyMap<string, HTMLElement>,
): Map<string, number> {
  return new Map(
    [...elements].map(([id, element]) => [
      id,
      element.getBoundingClientRect().left,
    ]),
  );
}

function widthsOf(
  elements: ReadonlyMap<string, HTMLElement>,
  order: readonly string[],
): number[] {
  return order.map(
    (id) => elements.get(id)?.getBoundingClientRect().width ?? 0,
  );
}

function gapOf(row: HTMLElement): number {
  return parseFloat(getComputedStyle(row).columnGap) || 0;
}

export function useTabDrag(
  strip: React.RefObject<HTMLDivElement | null>,
  tabs: readonly TabInfo[],
  active: string | undefined,
  onSelect: (id: string) => void,
  onMove: ((id: string, index: number) => void) | undefined,
  tearing: Tearing | undefined,
) {
  const press = useRef<Press>(undefined);
  const elements = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<Drag>();
  const [torn, setTorn] = useState<string>();
  const cancelTearing = useEffectEvent(() => tearing?.cancel());

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        press.current?.remote &&
        keyPressed(keymap.close, event) !== undefined
      ) {
        event.preventDefault();
        event.stopPropagation();
        press.current = undefined;
        setTorn(undefined);
        cancelTearing();
      }
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, []);

  const endRemote = () => {
    press.current = undefined;
    setTorn(undefined);
    tearing?.drop();
  };

  const tearOff = (pressed: Press, at: ScreenPoint) => {
    if (pressed.start !== undefined) {
      finish(pressed, false);
    }
    press.current = { ...pressed, remote: true };
    if (tabs.length > 1) {
      setTorn(pressed.id);
    }
    tearing?.tear(pressed.id, pressed.grab, at);
  };

  const sameTabs = (order: readonly string[]) =>
    order.length === tabs.length && tabs.every((tab) => order.includes(tab.id));

  const finish = (pressed: Press, kept: boolean) => {
    press.current = undefined;
    const before = leftsOf(elements.current);
    const index = pressed.order.indexOf(pressed.id);
    const moved =
      kept &&
      sameTabs(pressed.order) &&
      index !== tabs.findIndex((tab) => tab.id === pressed.id);
    flushSync(() => {
      setDrag(undefined);
      if (moved) {
        onMove?.(pressed.id, index);
      }
    });
    for (const [id, element] of elements.current) {
      slide(element, before.get(id));
    }
  };

  const follow = (pressed: Press, row: HTMLElement, x: number) => {
    const dragged = elements.current.get(pressed.id);
    if (!dragged || pressed.start === undefined) {
      return;
    }
    if (!sameTabs(pressed.order)) {
      finish(pressed, false);
      return;
    }
    const from = pressed.order.indexOf(pressed.id);
    const lefts = slotLefts(
      widthsOf(elements.current, pressed.order),
      gapOf(row),
      from,
    );
    const left = Math.min(
      Math.max(
        pressed.start + x - pressed.x + row.scrollLeft - pressed.scrolled,
        0,
      ),
      lefts.at(-1) ?? 0,
    );
    const to = nearestSlot(lefts, left);
    if (to !== from) {
      const before = leftsOf(elements.current);
      const order = pressed.order
        .toSpliced(from, 1)
        .toSpliced(to, 0, pressed.id);
      pressed.order = order;
      flushSync(() => setDrag({ id: pressed.id, order }));
      for (const [id, element] of elements.current) {
        if (id !== pressed.id) {
          slide(element, before.get(id));
        }
      }
    }
    dragged.style.transform = `translateX(${left - lefts[to]}px)`;
  };

  const start = (pressed: Press, row: HTMLElement) => {
    const from = pressed.order.indexOf(pressed.id);
    pressed.start = slotLefts(
      widthsOf(elements.current, pressed.order),
      gapOf(row),
      from,
    )[from];
    const order = pressed.order;
    flushSync(() => setDrag({ id: pressed.id, order }));
    if (pressed.id !== active) {
      onSelect(pressed.id);
    }
  };

  const cancel = (event: React.PointerEvent<HTMLElement>) => {
    const pressed = press.current;
    if (pressed?.remote && pressed.pointer === event.pointerId) {
      endRemote();
    } else if (pressed?.pointer === event.pointerId) {
      finish(pressed, false);
    }
  };

  const pressing = (id: string) =>
    onMove && (tabs.length > 1 || tearing !== undefined)
      ? {
          onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
            if (
              !clicked(shellKeymap.moveTab, event) ||
              (event.target instanceof Element &&
                event.target.closest('.tab-close'))
            ) {
              return;
            }
            const tab = event.currentTarget.getBoundingClientRect();
            press.current = {
              id,
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              grab: { x: event.clientX - tab.left, y: event.clientY - tab.top },
              scrolled: strip.current?.scrollLeft ?? 0,
              order: tabs.map((each) => each.id),
            };
          },
        }
      : {};

  const dragging = {
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const pressed = press.current;
      const row = strip.current;
      if (!pressed || pressed.pointer !== event.pointerId || !row) {
        return;
      }
      if (pressed.remote) {
        if (released(event)) {
          endRemote();
        } else {
          tearing?.to({ x: event.screenX, y: event.screenY });
        }
        return;
      }
      if (released(event)) {
        press.current = undefined;
        if (pressed.start !== undefined) {
          finish(pressed, true);
        }
        return;
      }
      if (pressed.start === undefined) {
        if (
          Math.max(
            Math.abs(event.clientX - pressed.x),
            Math.abs(event.clientY - pressed.y),
          ) < dragDistance
        ) {
          return;
        }
        row.setPointerCapture(event.pointerId);
        if (tabs.length < 2) {
          tearOff(pressed, { x: event.screenX, y: event.screenY });
          return;
        }
        start(pressed, row);
      }
      if (
        tearing !== undefined &&
        tornOut(row.getBoundingClientRect(), event.clientY)
      ) {
        tearOff(pressed, { x: event.screenX, y: event.screenY });
        return;
      }
      follow(pressed, row, event.clientX);
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      const pressed = press.current;
      if (!pressed || pressed.pointer !== event.pointerId) {
        return;
      }
      if (pressed.remote) {
        endRemote();
        return;
      }
      press.current = undefined;
      if (pressed.start !== undefined) {
        finish(pressed, true);
      }
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
  };

  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const shown =
    drag && sameTabs(drag.order)
      ? drag.order.flatMap((id) => byId.get(id) ?? [])
      : tabs.filter((tab) => tab.id !== torn);

  return {
    shown,
    elements,
    dragged: drag?.id,
    pressing,
    dragging,
    element: (id: string) => (element: HTMLElement | null) => {
      if (element) {
        elements.current.set(id, element);
      }
      return () => {
        elements.current.delete(id);
      };
    },
  };
}
