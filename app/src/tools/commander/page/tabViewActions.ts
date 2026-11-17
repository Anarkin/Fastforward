import { sides } from '../shared/sides';
import type { CommanderToWebviewOf } from '../shared/protocol';
import type { PaneFilter } from './state';
import type { StoreParts } from './dialogActions';
import { withoutWhere, withRecent } from '../../../lib/page/recentPlaces';
import { filterKey, withoutTab } from './sideFilters';
import { ViewKeeper, type KeptViews } from '../../../lib/page/viewKeeper';
import {
  keptTabOf,
  sidesKeptFrom,
  sidesKeptOf,
  sidesViewOf,
  type SidesKept,
} from './sidesView';
import { reduceView } from './view';
import { withoutParked } from './parkedDialogs';

function withFilters(
  filters: ReadonlyMap<string, PaneFilter>,
  tab: string,
  kept: SidesKept['filters'],
): ReadonlyMap<string, PaneFilter> {
  const next = new Map(withoutTab(filters, tab));
  for (const side of sides) {
    const filter = kept?.[side];
    if (filter !== undefined) {
      next.set(filterKey(tab, side), filter);
    }
  }
  return next;
}

function parsedOf(kept: string): unknown {
  try {
    return JSON.parse(kept);
  } catch {
    return undefined;
  }
}

export function keptTabActions({ set, get }: StoreParts, views: KeptViews) {
  const known = new Set<string>();
  const viewOf = (tab: string): string | undefined => {
    if (!known.has(tab)) {
      return undefined;
    }
    const kept = sidesKeptOf(get(), tab);
    return kept && sidesViewOf(kept);
  };
  const keeping = new ViewKeeper(views, viewOf, () => get().view.tab);
  const restore = (tab: string, value: string) => {
    const restored = sidesKeptFrom(parsedOf(value), tab);
    if (restored !== undefined) {
      set((state) => ({
        view: reduceView(state.view, {
          type: 'restore',
          tab,
          kept: keptTabOf(restored),
        }),
        filters: withFilters(state.filters, tab, restored.filters),
        parked:
          restored.dialogs === undefined ||
          Object.keys(restored.dialogs).length === 0
            ? withoutParked(state.parked, tab)
            : new Map(state.parked).set(tab, restored.dialogs),
        scrolls: (restored.scrolls ?? []).reduce(
          (scrolls, [key, offset]) =>
            withRecent(scrolls, `${tab} ${key}`, offset),
          withoutWhere(state.scrolls, (key) => key.startsWith(`${tab} `)),
        ),
      }));
    }
  };
  return {
    changed: (tab: string | undefined) => keeping.changed(tab),
    flush: () => keeping.flush(),
    shown: (message: CommanderToWebviewOf<'show'>) => {
      known.add(message.tab);
      const view =
        get().view.tab === message.tab
          ? undefined
          : keeping.handed(message.tab);
      if (view !== undefined) {
        restore(message.tab, view);
      }
    },
    leaving: (tab: string | undefined) => {
      if (tab !== undefined && tab !== get().view.tab) {
        keeping.left(tab);
      }
    },
    knows: (tab: string) => known.has(tab),
    release: (tab: string) => {
      const view = keeping.release(tab);
      known.delete(tab);
      return view;
    },
    forget: (tab: string) => {
      keeping.forget(tab);
      known.delete(tab);
    },
  };
}
