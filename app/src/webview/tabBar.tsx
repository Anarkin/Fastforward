import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { type TabInfo } from '../shared/protocol';
import { AddIcon, CloseIcon } from './icons';
import { AppIcon } from './titleBar';
import { titleBarHeight } from '../shared/titleBar';
import { clicked, keymap, released } from '../shared/keymap';
import { strings } from '../shared/strings';
import { useBinding } from './shortcuts';

export function adjacentTab(
  tabs: readonly TabInfo[],
  active: string | undefined,
  step: 1 | -1,
): string | undefined {
  if (tabs.length < 2) {
    return undefined;
  }
  const index = tabs.findIndex((tab) => tab.root === active);
  const next = index === -1 ? 0 : (index + step + tabs.length) % tabs.length;
  return tabs[next].root;
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

export function movedTab<T extends { readonly root: string }>(
  tabs: readonly T[],
  root: string,
  index: number,
): readonly T[] {
  const from = tabs.findIndex((tab) => tab.root === root);
  return from === -1
    ? tabs
    : tabs.toSpliced(from, 1).toSpliced(index, 0, tabs[from]);
}

const dragDistance = 4;

interface Press {
  readonly root: string;
  readonly pointer: number;
  readonly x: number;
  readonly y: number;
  readonly scrolled: number;
  order: readonly string[];
  start?: number;
}

interface Drag {
  readonly root: string;
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
    [...elements].map(([root, element]) => [
      root,
      element.getBoundingClientRect().left,
    ]),
  );
}

function widthsOf(
  elements: ReadonlyMap<string, HTMLElement>,
  order: readonly string[],
): number[] {
  return order.map(
    (root) => elements.get(root)?.getBoundingClientRect().width ?? 0,
  );
}

function gapOf(row: HTMLElement): number {
  return parseFloat(getComputedStyle(row).columnGap) || 0;
}

function useTabDrag(
  strip: React.RefObject<HTMLDivElement | null>,
  tabs: readonly TabInfo[],
  active: string | undefined,
  onSelect: (root: string) => void,
  onMove: ((root: string, index: number) => void) | undefined,
) {
  const press = useRef<Press>(undefined);
  const elements = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<Drag>();

  const sameTabs = (order: readonly string[]) =>
    order.length === tabs.length &&
    tabs.every((tab) => order.includes(tab.root));

  const finish = (pressed: Press, kept: boolean) => {
    press.current = undefined;
    const before = leftsOf(elements.current);
    const index = pressed.order.indexOf(pressed.root);
    const moved =
      kept &&
      sameTabs(pressed.order) &&
      index !== tabs.findIndex((tab) => tab.root === pressed.root);
    flushSync(() => {
      setDrag(undefined);
      if (moved) {
        onMove?.(pressed.root, index);
      }
    });
    for (const [root, element] of elements.current) {
      slide(element, before.get(root));
    }
  };

  const follow = (pressed: Press, row: HTMLElement, x: number) => {
    const dragged = elements.current.get(pressed.root);
    if (!dragged || pressed.start === undefined) {
      return;
    }
    if (!sameTabs(pressed.order)) {
      finish(pressed, false);
      return;
    }
    const from = pressed.order.indexOf(pressed.root);
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
        .toSpliced(to, 0, pressed.root);
      pressed.order = order;
      flushSync(() => setDrag({ root: pressed.root, order }));
      for (const [root, element] of elements.current) {
        if (root !== pressed.root) {
          slide(element, before.get(root));
        }
      }
    }
    dragged.style.transform = `translateX(${left - lefts[to]}px)`;
  };

  const start = (pressed: Press, row: HTMLElement) => {
    const from = pressed.order.indexOf(pressed.root);
    pressed.start = slotLefts(
      widthsOf(elements.current, pressed.order),
      gapOf(row),
      from,
    )[from];
    const order = pressed.order;
    flushSync(() => setDrag({ root: pressed.root, order }));
    if (pressed.root !== active) {
      onSelect(pressed.root);
    }
  };

  const cancel = (event: React.PointerEvent<HTMLElement>) => {
    const pressed = press.current;
    if (pressed?.pointer === event.pointerId) {
      finish(pressed, false);
    }
  };

  const pressing = (root: string) =>
    onMove && tabs.length > 1
      ? {
          onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
            if (
              !clicked(keymap.moveRepository, event) ||
              (event.target instanceof Element &&
                event.target.closest('.tab-close'))
            ) {
              return;
            }
            press.current = {
              root,
              pointer: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              scrolled: strip.current?.scrollLeft ?? 0,
              order: tabs.map((tab) => tab.root),
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

  const byRoot = new Map(tabs.map((tab) => [tab.root, tab]));
  const shown =
    drag && sameTabs(drag.order)
      ? drag.order.flatMap((root) => byRoot.get(root) ?? [])
      : tabs;

  return {
    shown,
    dragged: drag?.root,
    pressing,
    dragging,
    element: (root: string) => (element: HTMLElement | null) => {
      if (element) {
        elements.current.set(root, element);
      }
      return () => {
        elements.current.delete(root);
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
}: {
  tabs: readonly TabInfo[];
  active: string | undefined;
  onSelect: (root: string) => void;
  onPreload: (root: string) => void;
  onClose: (root: string) => void;
  onMove?: (root: string, index: number) => void;
  onAdd: (event: React.MouseEvent) => void;
  onLog: (message: string) => void;
  menu?: React.ReactNode;
}) {
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);

  const overflowing = useOverflowing(strip, list);
  const drag = useTabDrag(strip, tabs, active, onSelect, onMove);
  const dragging = drag.dragged !== undefined;
  const activeIndex = tabs.findIndex((tab) => tab.root === active);
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
  useBinding(keymap.openRepository, () => add.current?.click());
  const [cycle] = useState(() => new Cycle());
  useEffect(() => cycle.seen(active), [cycle, active]);
  useBinding(keymap.repository, (step) => {
    const root = cycle.next(active, (from) => adjacentTab(tabs, from, step));
    if (root !== undefined) {
      onSelect(root);
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
          aria-label={strings.tabs.repositories}
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
              key={tab.root}
              ref={drag.element(tab.root)}
              role="tab"
              aria-selected={tab.root === open}
              className={`tab ${tab.root === open ? 'active' : ''} ${tab.root === drag.dragged ? 'dragging' : ''}`}
              title={tab.root}
              {...drag.pressing(tab.root)}
              onClick={() => {
                rest.cancel();
                onSelect(tab.root);
              }}
              onPointerEnter={() =>
                tab.root !== active && rest.start(() => onPreload(tab.root))
              }
              onPointerLeave={rest.cancel}
              onMouseDown={(event) =>
                clicked(keymap.closeRepository, event) && event.preventDefault()
              }
              onAuxClick={(event) =>
                clicked(keymap.closeRepository, event) && onClose(tab.root)
              }
            >
              <span className="tab-divider" />
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
                  onClose(tab.root);
                }}
              >
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
        <button
          ref={add}
          className="nav-button tab-add"
          title={strings.actions.openRepository}
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
