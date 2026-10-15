import { useEffect, useMemo, useRef, useState } from 'react';
import { type TabInfo } from '../shared/protocol';
import { AddIcon, CloseIcon } from './icons';
import { AppIcon } from './titleBar';
import { titleBarHeight } from '../shared/titleBar';
import { clicked, keymap } from '../shared/keymap';
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
    const measure = () =>
      setOverflowing((was) =>
        stripOverflows(
          was,
          element.scrollWidth,
          element.clientWidth,
          parseFloat(getComputedStyle(element).paddingLeft) || 0,
        ),
      );
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
  onAdd,
  onLog,
  menu,
}: {
  tabs: readonly TabInfo[];
  active: string | undefined;
  onSelect: (root: string) => void;
  onPreload: (root: string) => void;
  onClose: (root: string) => void;
  onAdd: (event: React.MouseEvent) => void;
  onLog: (message: string) => void;
  menu?: React.ReactNode;
}) {
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);

  const overflowing = useOverflowing(strip, list);
  const activeIndex = tabs.findIndex((tab) => tab.root === active);
  useEffect(() => {
    if (overflowing) {
      revealTab(strip.current, activeIndex);
    }
  }, [overflowing, activeIndex]);

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
          onWheel={(event) => {
            event.currentTarget.scrollLeft += sidewaysDelta(
              event.deltaX,
              event.deltaY,
            );
          }}
        >
          {tabs.map((tab) => (
            <div
              key={tab.root}
              role="tab"
              aria-selected={tab.root === active}
              className={`tab ${tab.root === active ? 'active' : ''}`}
              title={tab.root}
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
