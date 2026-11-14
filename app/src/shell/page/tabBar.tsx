import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type StripPlace,
  type TabInfo,
  type TabVisit,
  type WindowInfo,
} from '../shared/protocol';
import type { ContextMenuItem } from '../../lib/page/menuControls';
import type { ToolId } from '../shared/tools';
import { AddIcon, CloseIcon, ToolIcon } from '../../lib/page/icons';
import { titleBarHeight } from '../shared/titleBar';
import { shellKeymap } from '../shared/keymap';
import { clicked } from '../../lib/shared/keymap';
import { strings } from '../../lib/shared/strings';
import { useBinding } from '../../lib/page/shortcuts';
import { useShell, useShellActions } from './store';

import { visitedSlot, slide, useTabDrag } from './tabDrag';
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
  const shifted = useRef<HTMLElement>(undefined);
  const others = useMemo(
    () => (visit ? tabs.filter((tab) => tab.id !== visit.tab.id) : tabs),
    [tabs, visit],
  );
  useLayoutEffect(() => {
    const row = strip.current;
    const left = visited.current;
    if (left !== undefined && left !== visit?.tab.id) {
      visited.current = undefined;
      const element = shifted.current;
      shifted.current = undefined;
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
      shifted.current = visitor;
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
    tab.unsaved === true && (
      <span
        key="unsaved"
        className="tab-unsaved"
        title={strings.editor.unsaved}
      >
        {strings.symbols.unsaved}
      </span>
    ),
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
  useBinding(shellKeymap.newTab, () => add.current?.click());
  const [cycle] = useState(() => new Cycle());
  useEffect(() => cycle.seen(active), [cycle, active]);
  useBinding(shellKeymap.tab, (step) => {
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
                  clicked(shellKeymap.closeTab, event) && onClose(tab.id)
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
