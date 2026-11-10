import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import {
  type StripPlace,
  type TabInfo,
  type TabVisit,
  type WindowInfo,
} from '../shared/protocol';
import type { ContextMenuItem } from '../../ui/contextMenu';
import type { ToolId } from '../shared/tools';
import { AddIcon, CloseIcon, ToolIcon } from '../../ui/icons';
import { tabMagnetism, titleBarHeight } from '../shared/titleBar';
import { clicked, keymap, released } from '../shared/keymap';
import { strings } from '../../shared/strings';
import { keyPressed, useBinding } from '../../ui/shortcuts';
import { useShell, useShellActions, type ScreenPoint } from './store';

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

export function tabsWidth(
  tabs: readonly {
    readonly offsetLeft: number;
    readonly offsetWidth: number;
    readonly marginRight: number;
  }[],
): number {
  const first = tabs.at(0);
  const last = tabs.at(-1);
  return first && last
    ? last.offsetLeft + last.offsetWidth + last.marginRight - first.offsetLeft
    : 0;
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
      const ends = [tabs.at(0), tabs.at(-1)].flatMap((tab) =>
        tab
          ? [
              {
                offsetLeft: tab.offsetLeft,
                offsetWidth: tab.offsetWidth,
                marginRight: parseFloat(getComputedStyle(tab).marginRight) || 0,
              },
            ]
          : [],
      );
      const padding = parseFloat(getComputedStyle(element).paddingLeft) || 0;
      const laidOut = tabsWidth(ends);
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
  const tab = strip?.querySelectorAll(':scope > [role="tab"]')[index];
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

type Motion = 'opening' | 'closing';

interface Placed<T> {
  readonly tab: T;
  readonly motion?: Motion;
}

function placedTabs<T extends { readonly id: string }>(
  before: readonly Placed<T>[],
  tabs: readonly T[],
): Placed<T>[] {
  const staying = new Map(
    before.flatMap((placed) =>
      placed.motion === 'closing' ? [] : [[placed.tab.id, placed] as const],
    ),
  );
  const placed: Placed<T>[] = tabs.map((tab) => {
    const motion = staying.has(tab.id)
      ? staying.get(tab.id)?.motion
      : before.length > 0
        ? 'opening'
        : undefined;
    return motion ? { tab, motion } : { tab };
  });
  const open = new Set(tabs.map((tab) => tab.id));
  let at = 0;
  for (const shown of before) {
    if (open.has(shown.tab.id)) {
      at = placed.findIndex((item) => item.tab.id === shown.tab.id) + 1;
    } else {
      placed.splice(at, 0, { tab: shown.tab, motion: 'closing' });
      at += 1;
    }
  }
  return placed;
}

function settledTab<T extends { readonly id: string }>(
  placed: readonly Placed<T>[],
  id: string,
): Placed<T>[] {
  return placed.flatMap((item) =>
    item.tab.id !== id || item.motion === undefined
      ? [item]
      : item.motion === 'closing'
        ? []
        : [{ tab: item.tab }],
  );
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((tab, index) => tab === b[index]);
}

function usePlacedTabs<T extends { readonly id: string }>(
  tabs: readonly T[],
): {
  placed: readonly Placed<T>[];
  settled: (id: string) => void;
} {
  const [state, setState] = useState(() => ({
    tabs,
    placed: placedTabs([], tabs),
  }));
  let placed = state.placed;
  if (!sameList(state.tabs, tabs)) {
    placed = placedTabs(state.placed, tabs);
    setState({ tabs, placed });
  }
  const settled = useCallback(
    (id: string) =>
      setState((current) => ({
        ...current,
        placed: settledTab(current.placed, id),
      })),
    [],
  );
  return { placed, settled };
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
  readonly grab: ScreenPoint;
  readonly scrolled: number;
  order: readonly string[];
  start?: number;
  remote?: true;
}

interface Tearing {
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
              !clicked(keymap.moveTab, event) ||
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

export function tabMenuItems(
  tab: string,
  alone: boolean,
  windows: readonly WindowInfo[],
  move: (tab: string, window?: string) => void,
): ContextMenuItem[] {
  return [
    {
      label: strings.tabs.moveToNewWindow,
      disabled: alone,
      onClick: () => move(tab),
    },
    ...(windows.length === 0
      ? []
      : [
          {
            label: strings.tabs.moveToWindow,
            submenu: windows.map((window) => ({
              label: window.name,
              onClick: () => move(tab, window.id),
            })),
          },
        ]),
  ];
}

function useVisit(
  strip: React.RefObject<HTMLDivElement | null>,
  elements: React.RefObject<Map<string, HTMLElement>>,
  tabs: readonly TabInfo[],
  visit: TabVisit | undefined,
  onIndex: (index: number) => void,
): readonly TabInfo[] {
  const [index, setIndex] = useState<number>();
  const visited = useRef<string>(undefined);
  const others = useMemo(
    () => (visit ? tabs.filter((tab) => tab.id !== visit.tab.id) : tabs),
    [tabs, visit],
  );
  useLayoutEffect(() => {
    const row = strip.current;
    const left = visited.current;
    if (left !== undefined && left !== visit?.tab.id) {
      visited.current = undefined;
      const element = elements.current.get(left);
      if (element !== undefined) {
        const from = element.getBoundingClientRect().left;
        element.style.transform = '';
        slide(element, from);
      }
    }
    if (visit === undefined || row === null) {
      setIndex(undefined);
      return;
    }
    visited.current = visit.tab.id;
    const style = getComputedStyle(row);
    const origin =
      row.getBoundingClientRect().left +
      (parseFloat(style.paddingLeft) || 0) -
      row.scrollLeft;
    const widths = others.map(
      (tab) => elements.current.get(tab.id)?.offsetWidth ?? 0,
    );
    const visitor = elements.current.get(visit.tab.id);
    const { index: to, shift } = visitedSlot(
      widths,
      parseFloat(style.columnGap) || 0,
      visit.x - visit.grabX - origin,
    );
    if (to !== index) {
      setIndex(to);
      onIndex(to);
    } else if (visitor !== undefined) {
      visitor.style.transform = `translateX(${shift}px)`;
    }
  }, [strip, elements, others, visit, index, onIndex]);
  return visit === undefined
    ? tabs
    : others.toSpliced(index ?? others.length, 0, visit.tab);
}

function useStripReport(
  bar: React.RefObject<HTMLElement | null>,
  list: React.RefObject<HTMLElement | null>,
  strip: React.RefObject<HTMLElement | null>,
  report: (strip: StripPlace) => void,
): void {
  const told = useRef<string>(undefined);
  useEffect(() => {
    const measure = () => {
      const nav = bar.current?.getBoundingClientRect();
      const area = list.current?.getBoundingClientRect();
      const row = strip.current;
      if (nav === undefined || area === undefined || !row) {
        return;
      }
      const first = row.querySelector('[role="tab"]');
      const tab = first?.getBoundingClientRect();
      const place: StripPlace = {
        left: area.left,
        right: area.right,
        top: nav.top,
        bottom: nav.bottom,
        firstTabLeft:
          tab?.left ??
          row.getBoundingClientRect().left +
            (parseFloat(getComputedStyle(row).paddingLeft) || 0),
        tabTop: tab?.top ?? nav.top,
      };
      const json = JSON.stringify(place);
      if (json !== told.current) {
        told.current = json;
        report(place);
      }
    };
    measure();
    const resized = new ResizeObserver(measure);
    for (const element of [bar.current, list.current, strip.current]) {
      if (element) {
        resized.observe(element);
      }
    }
    const changed = new MutationObserver(measure);
    if (strip.current) {
      changed.observe(strip.current, { childList: true });
    }
    window.addEventListener('resize', measure);
    return () => {
      resized.disconnect();
      changed.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [bar, list, strip, report]);
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

function TabIcon({ url, tool }: { url: string; tool: ToolId }) {
  const [failed, setFailed] = useState<string>();
  return failed === url ? (
    <ToolIcon tool={tool} />
  ) : (
    <img
      className="icon tab-icon"
      src={url}
      alt=""
      draggable={false}
      onError={() => setFailed(url)}
    />
  );
}

function tabContent(tab: TabInfo, onClose?: () => void): React.ReactNode[] {
  return [
    <span key="divider" className="tab-divider" />,
    tab.icon === undefined ? (
      <ToolIcon key="icon" tool={tab.tool} />
    ) : (
      <TabIcon key="icon" url={tab.icon} tool={tab.tool} />
    ),
    <span key="name" className="tab-name">
      {tab.name}
    </span>,
    tab.folder !== undefined && (
      <span key="folder" className="tab-folder">
        {tab.folder}
      </span>
    ),
    <button
      key="close"
      className="tab-close"
      title={strings.common.close}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onClose?.();
      }}
    >
      <CloseIcon />
    </button>,
  ];
}

export const newTabTrigger = '.tab-add';

const noTabs: readonly TabInfo[] = [];

export function TabBar({ menu }: { menu?: React.ReactNode }) {
  const tabs = useShell((state) => state.tabs ?? noTabs);
  const active = useShell((state) => state.active);
  const windows = useShell((state) => state.windows);
  const tearsOff = useShell((state) => state.tearsOff);
  const visit = useShell((state) => state.visit);
  const adding = useShell(
    (state) => state.menu?.menu.trigger === newTabTrigger,
  );
  const {
    selectTab: onSelect,
    preloadTab: onPreload,
    closeTab: onClose,
    moveTab: onMove,
    moveTabToWindow,
    tearTab,
    dragTabTo,
    dropTab,
    cancelTabDrag,
    reportStrip,
    visitIndex,
    log: onLog,
    showMenu,
    closeMenu,
  } = useShellActions();
  const onAdd = (event: React.MouseEvent) => {
    if (adding) {
      closeMenu();
      return;
    }
    const button = event.currentTarget.getBoundingClientRect();
    showMenu({
      x: button.left,
      y: button.bottom,
      items: [],
      trigger: newTabTrigger,
    });
  };
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);

  const overflowing = useOverflowing(strip, list);
  const tears = tearsOff && (tabs.length > 1 || windows.length > 0);
  const drag = useTabDrag(
    strip,
    tabs,
    active,
    onSelect,
    onMove,
    tears
      ? {
          tear: tearTab,
          to: dragTabTo,
          drop: dropTab,
          cancel: cancelTabDrag,
        }
      : undefined,
  );
  useStripReport(bar, list, strip, reportStrip);
  const shown = useVisit(strip, drag.elements, drag.shown, visit, visitIndex);
  const visitor = visit?.tab.id;
  const dragging = drag.dragged !== undefined;
  const activeIndex = tabs.findIndex((tab) => tab.id === active);
  const { placed, settled } = usePlacedTabs(shown);
  const activeOpening = placed.some(
    ({ tab, motion }) => tab.id === active && motion === 'opening',
  );
  useEffect(() => {
    if (!overflowing || dragging) {
      return undefined;
    }
    revealTab(strip.current, activeIndex);
    if (!activeOpening) {
      return undefined;
    }
    let frame = requestAnimationFrame(function follow() {
      revealTab(strip.current, activeIndex);
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [overflowing, activeIndex, dragging, activeOpening]);
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
    <nav
      className={tears && windows.length > 0 ? 'tabs tearing' : 'tabs'}
      ref={bar}
      style={{ minHeight: titleBarHeight }}
    >
      {menu}
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
          {placed.map(({ tab, motion }) =>
            motion === 'closing' ? (
              <div
                key={tab.id}
                className="tab closing"
                aria-hidden
                inert
                onAnimationEnd={(event) =>
                  event.target === event.currentTarget && settled(tab.id)
                }
              >
                {tabContent(tab)}
              </div>
            ) : (
              <div
                key={tab.id}
                ref={drag.element(tab.id)}
                role="tab"
                aria-selected={tab.id === open}
                className={`tab ${tab.id === open || tab.id === visitor ? 'active' : ''} ${tab.id === drag.dragged || tab.id === visitor ? 'dragging' : ''} ${motion ?? ''}`}
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
                onMouseDown={(event) => event.preventDefault()}
                onAuxClick={(event) =>
                  clicked(keymap.closeTab, event) && onClose(tab.id)
                }
                onContextMenu={(event) => {
                  event.preventDefault();
                  showMenu({
                    x: event.clientX,
                    y: event.clientY,
                    items: tabMenuItems(
                      tab.id,
                      tabs.length < 2,
                      windows,
                      moveTabToWindow,
                    ),
                  });
                }}
                onAnimationEnd={(event) =>
                  event.target === event.currentTarget && settled(tab.id)
                }
              >
                {tabContent(tab, () => onClose(tab.id))}
              </div>
            ),
          )}
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
    </nav>
  );
}

function elementWidth(element: Element | null): number {
  return element ? Math.round(element.getBoundingClientRect().width) : 0;
}
