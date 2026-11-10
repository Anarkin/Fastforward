import type { SavedTab } from './storage';

export interface TabWindow {
  readonly id: string;
  readonly tabs: readonly SavedTab[];
  readonly active?: string;
}

export type Layout = readonly TabWindow[];

interface History {
  after(
    closed: string,
    rest: readonly { readonly id: string }[],
    index: number,
  ): string | undefined;
}

export function windowOf(layout: Layout, tab: string): TabWindow | undefined {
  return layout.find((window) => window.tabs.some((each) => each.id === tab));
}

export function activeTabOf(
  window: TabWindow | undefined,
): SavedTab | undefined {
  return window?.tabs.find((tab) => tab.id === window.active);
}

export function nextTabId(layout: Layout): string {
  const ids = layout.flatMap((window) =>
    window.tabs.map((tab) => Number(tab.id)).filter(Number.isInteger),
  );
  return String(Math.max(0, ...ids) + 1);
}

function withWindow(
  layout: Layout,
  id: string,
  change: (window: TabWindow) => TabWindow,
): Layout {
  return layout.map((window) => (window.id === id ? change(window) : window));
}

function activeOf(
  tabs: readonly SavedTab[],
  active: string | undefined,
): { readonly active?: string } {
  return active !== undefined && tabs.some((tab) => tab.id === active)
    ? { active }
    : {};
}

function settled(window: TabWindow): TabWindow {
  const { active, ...rest } = window;
  return { ...rest, ...activeOf(rest.tabs, active) };
}

export function withActive(
  layout: Layout,
  window: string,
  tab: string | undefined,
): Layout {
  return withWindow(layout, window, (each) =>
    settled({ ...each, active: tab }),
  );
}

export function withOpened(
  layout: Layout,
  window: string,
  tabs: readonly SavedTab[],
): Layout {
  return layout.some((each) => each.id === window)
    ? withWindow(layout, window, (each) => ({
        ...each,
        tabs: [...each.tabs, ...tabs],
      }))
    : layout;
}

export function withChanged(layout: Layout, tab: SavedTab): Layout {
  return layout.map((window) =>
    window.tabs.some((each) => each.id === tab.id)
      ? {
          ...window,
          tabs: window.tabs.map((each) => (each.id === tab.id ? tab : each)),
        }
      : window,
  );
}

export function withClosed(
  layout: Layout,
  tab: string,
  history: History,
): Layout {
  const from = windowOf(layout, tab);
  if (from === undefined) {
    return layout;
  }
  const index = from.tabs.findIndex((each) => each.id === tab);
  const rest = from.tabs.toSpliced(index, 1);
  if (rest.length === 0 && layout.length > 1) {
    return layout.filter((window) => window !== from);
  }
  const active =
    from.active === tab ? history.after(tab, rest, index) : from.active;
  return withWindow(layout, from.id, (window) =>
    settled({ ...window, tabs: rest, active }),
  );
}

export function withMoved(
  layout: Layout,
  tab: string,
  window: string,
  index: number,
  history: History,
): Layout {
  const from = windowOf(layout, tab);
  const moved = from?.tabs.find((each) => each.id === tab);
  if (
    from === undefined ||
    moved === undefined ||
    !layout.some((each) => each.id === window)
  ) {
    return layout;
  }
  if (from.id === window) {
    return withWindow(layout, window, (each) => ({
      ...each,
      tabs: each.tabs
        .filter((other) => other.id !== tab)
        .toSpliced(index, 0, moved),
    }));
  }
  return withWindow(withClosed(layout, tab, history), window, (each) => ({
    ...each,
    tabs: each.tabs.toSpliced(index, 0, moved),
    active: tab,
  }));
}
