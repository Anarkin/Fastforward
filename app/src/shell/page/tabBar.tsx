import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { type TabInfo } from '../shared/protocol';
import { AddIcon, CloseIcon, ToolIcon } from '../../ui/icons';
import { AppIcon } from './titleBar';
import { titleBarHeight } from '../shared/titleBar';
import { clicked, keymap, released } from '../shared/keymap';
import { strings } from '../../shared/strings';
import { useBinding } from '../../ui/shortcuts';

export function adjacentTab(
  tabs: readonly { readonly id: string }[],
  active: string | undefined,
  step: 1 | -1,
): string | undefined {
  if (tabs.length < 2) {
    return undefined;
  }
  const index = tabs.findIndex((tab) => tab.id === active);
  const next = index === -1 ? 0 : (index + step + tabs.length) % tabs.length;
  return tabs[next].id;
}

export class Cycle {
  private asked: string[] = [];
  private shown: string | undefined;

  seen(shown: string | undefined): void {
    if (shown !== this.shown) {
      this.shown = shown;
      const reached = shown === undefined ? -1 : this.asked.indexOf(shown);
      this.asked = reached === -1 ? [] : this.asked.slice(reached + 1);
    }
  }

  next(
    active: string | undefined,
    adjacent: (from: string | undefined) => string | undefined,
  ): string | undefined {
    this.seen(active);
    const next = adjacent(this.asked.at(-1) ?? active);
    if (next !== undefined) {
      this.asked.push(next);
    }
    return next;
  }
}

export function sidewaysDelta(deltaX: number, deltaY: number): number {
  return Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;
}

export function stripOverflows(
  overflowing: boolean,
  scrollWidth: number,
  clientWidth: number,
  padding: number,
): boolean {
  return overflowing
    ? scrollWidth - 2 * padding > clientWidth + 1
    : scrollWidth > clientWidth + 1;
}

function useOverflowing(
  strip: React.RefObject<HTMLElement | null>,
  list: React.RefObject<HTMLElement | null>,
): boolean {
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = strip.current;
    if (!element) {
      return undefined;
    }
    const measure = () => {
      const tabs = [...element.children].filter(
        (child) => child instanceof HTMLElement,
      );
      const first = tabs.at(0);
      const last = tabs.at(-1);
      const padding = parseFloat(getComputedStyle(element).paddingLeft) || 0;
      const laidOut =
        first && last
          ? last.offsetLeft + last.offsetWidth - first.offsetLeft
          : 0;
      setOverflowing((was) =>
        stripOverflows(
          was,
          laidOut + 2 * padding,
          element.clientWidth,
          padding,
        ),
      );
    };
    measure();
    const resized = new ResizeObserver(measure);
    resized.observe(element);
    if (list.current) {
      resized.observe(list.current);
    }
    const changed = new MutationObserver(measure);
    changed.observe(element, { childList: true, subtree: true });
    return () => {
      resized.disconnect();
      changed.disconnect();
    };
  }, [strip, list]);
  return overflowing;
}

export function revealingScroll(
  view: { readonly scrolled: number; readonly width: number },
  tab: { readonly start: number; readonly end: number },
  reach: number,
): number {
  const start = tab.start - reach;
  const end = tab.end + reach;
  if (start < view.scrolled) {
    return Math.max(0, start);
  }
  if (end > view.scrolled + view.width) {
    return end - view.width;
  }
  return view.scrolled;
}

function revealTab(strip: HTMLElement | null, index: number): void {
  const tab = strip?.children[index];
  if (!strip || !tab) {
    return;
  }
  const origin = strip.getBoundingClientRect().left - strip.scrollLeft;
  const { left, right } = tab.getBoundingClientRect();
  strip.scrollLeft = revealingScroll(
    { scrolled: strip.scrollLeft, width: strip.clientWidth },
    { start: left - origin, end: right - origin },
    parseFloat(getComputedStyle(strip).paddingLeft) || 0,
  );
}

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

interface Press {
  readonly id: string;
  readonly pointer: number;
  readonly x: number;
  readonly y: number;
  readonly scrolled: number;
  order: readonly string[];
  start?: number;
}

interface Drag {
  readonly id: string;
  readonly order: readonly string[];
}

function slide(element: HTMLElement, from: number | undefined): void {
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

function useTabDrag(
  strip: React.RefObject<HTMLDivElement | null>,
  tabs: readonly TabInfo[],
  active: string | undefined,
  onSelect: (id: string) => void,
  onMove: ((id: string, index: number) => void) | undefined,
) {
  const press = useRef<Press>(undefined);
  const elements = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<Drag>();

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
    if (pressed?.pointer === event.pointerId) {
      finish(pressed, false);
    }
  };

  const pressing = (id: string) =>
    onMove && tabs.length > 1
      ? {
          onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
            if (
              !clicked(keymap.moveTab, event) ||
              (event.target instanceof Element &&
                event.target.closest('.tab-close'))
            ) {
              return;
            }
            press.current = {
              id,
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              scrolled: strip.current?.scrollLeft ?? 0,
              order: tabs.map((tab) => tab.id),
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
        start(pressed, row);
      }
      follow(pressed, row, event.clientX);
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      const pressed = press.current;
      if (!pressed || pressed.pointer !== event.pointerId) {
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
      : tabs;

  return {
    shown,
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

export const preloadDelay = 200;

export function resting(delay: number): {
  start: (action: () => void) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => clearTimeout(timer);
  return {
    start: (action) => {
      cancel();
      timer = setTimeout(action, delay);
    },
    cancel,
  };
}

export function TabBar({
  tabs,
  active,
  onSelect,
  onPreload,
  onClose,
  onMove,
  onAdd,
  onLog,
  menu,
  adding = false,
}: {
  tabs: readonly TabInfo[];
  active: string | undefined;
  onSelect: (id: string) => void;
  onPreload: (id: string) => void;
  onClose: (id: string) => void;
  onMove?: (id: string, index: number) => void;
  onAdd: (event: React.MouseEvent) => void;
  onLog: (message: string) => void;
  menu?: React.ReactNode;
  adding?: boolean;
}) {
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);

  const overflowing = useOverflowing(strip, list);
  const drag = useTabDrag(strip, tabs, active, onSelect, onMove);
  const dragging = drag.dragged !== undefined;
  const activeIndex = tabs.findIndex((tab) => tab.id === active);
  useEffect(() => {
    if (overflowing && !dragging) {
      revealTab(strip.current, activeIndex);
    }
  }, [overflowing, activeIndex, dragging]);
  const open = drag.dragged ?? active;

  useEffect(() => {
    requestAnimationFrame(() => {
      onLog(
        strings.log.layout(
          window.innerWidth,
          window.innerHeight,
          window.devicePixelRatio,
          elementWidth(document.body),
          elementWidth(bar.current),
          elementWidth(list.current),
        ),
      );
    });
  }, [onLog]);

  const rest = useMemo(() => resting(preloadDelay), []);
  useEffect(() => rest.cancel, [rest]);

  const add = useRef<HTMLButtonElement>(null);
  useBinding(keymap.newTab, () => add.current?.click());
  const [cycle] = useState(() => new Cycle());
  useEffect(() => cycle.seen(active), [cycle, active]);
  useBinding(keymap.tab, (step) => {
    const id = cycle.next(active, (from) => adjacentTab(tabs, from, step));
    if (id !== undefined) {
      onSelect(id);
    }
  });

  return (
    <nav className="tabs" ref={bar} style={{ minHeight: titleBarHeight }}>
      <AppIcon />
      <div className="tab-list" ref={list}>
        <div
          className={overflowing ? 'tab-strip overflowing' : 'tab-strip'}
          ref={strip}
          role="tablist"
          aria-label={strings.tabs.tabs}
          {...drag.dragging}
          onWheel={(event) => {
            event.currentTarget.scrollLeft += sidewaysDelta(
              event.deltaX,
              event.deltaY,
            );
          }}
        >
          {drag.shown.map((tab) => (
            <div
              key={tab.id}
              ref={drag.element(tab.id)}
              role="tab"
              aria-selected={tab.id === open}
              className={`tab ${tab.id === open ? 'active' : ''} ${tab.id === drag.dragged ? 'dragging' : ''}`}
              title={tab.root ?? tab.name}
              {...drag.pressing(tab.id)}
              onClick={() => {
                rest.cancel();
                onSelect(tab.id);
              }}
              onPointerEnter={() =>
                tab.id !== active && rest.start(() => onPreload(tab.id))
              }
              onPointerLeave={rest.cancel}
              onMouseDown={(event) =>
                clicked(keymap.closeTab, event) && event.preventDefault()
              }
              onAuxClick={(event) =>
                clicked(keymap.closeTab, event) && onClose(tab.id)
              }
            >
              <span className="tab-divider" />
              <ToolIcon tool={tab.tool} />
              <span className="tab-name">{tab.name}</span>
              {tab.folder !== undefined && (
                <span className="tab-folder">{tab.folder}</span>
              )}
              <button
                className="tab-close"
                title={strings.common.close}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
        <button
          ref={add}
          className={`nav-button tab-add ${adding ? 'open' : ''}`}
          title={strings.tabs.newTab}
          aria-haspopup="menu"
          aria-expanded={adding}
          onClick={onAdd}
        >
          <AddIcon />
        </button>
      </div>
      {menu}
    </nav>
  );
}

function elementWidth(element: Element | null): number {
  return element ? Math.round(element.getBoundingClientRect().width) : 0;
}
