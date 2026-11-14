import { type WindowInfo } from '../shared/protocol';
import type { ContextMenuItem } from '../../lib/page/menuControls';
import { strings } from '../../lib/shared/strings';

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

export const newTabTrigger = '.tab-add';
