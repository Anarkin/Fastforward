import { sides } from '../shared/sides';
import type { CommanderToWebviewOf } from '../shared/protocol';
import type { PaneFilter } from './commanderState';
import type { StoreParts } from './dialogActions';
import type { ScrollPlaces } from './scrollPlaces';
import { filterKey, withoutTab } from './sideFilters';
import { TabKeeping } from './tabKeeping';
import {
  keptTabOf,
  sidesKeptOf,
  tabKeptOf,
  type EditorKept,
  type SidesKept,
  type TabKept,
  type ViewerKept,
} from './tabKept';
import { reduceView } from './view';
import { withoutParked } from './parkedDialogs';

type TabKind = 'sides' | 'viewer' | 'editor';

interface Memory<T> {
  readonly kept: (tab: string) => T;
  readonly restore: (tab: string, kept: T) => void;
}

const kindOf = ({ file, edit }: CommanderToWebviewOf<'show'>): TabKind =>
  file === undefined ? 'sides' : edit === true ? 'editor' : 'viewer';

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

export function keptTabActions(
  { set, get, post }: StoreParts,
  scrolls: ScrollPlaces,
  viewer: Memory<ViewerKept>,
  editor: Memory<EditorKept>,
) {
  const kinds = new Map<string, TabKind>();
  const keptOf = (tab: string): TabKept | undefined => {
    switch (kinds.get(tab)) {
      case 'sides': {
        const kept = sidesKeptOf(get(), tab, scrolls);
        return kept && { sides: kept };
      }
      case 'viewer':
        return {
          viewer: { ...viewer.kept(tab), choices: get().view.viewers.get(tab) },
        };
      case 'editor':
        return { editor: editor.kept(tab) };
      default:
        return undefined;
    }
  };
  const keeping = new TabKeeping(
    keptOf,
    (tab, kept) => post({ type: 'keepTab', tab, kept }),
    () => get().view.tab,
  );
  const restore = (tab: string, kind: TabKind, value: string) => {
    const kept = tabKeptOf(parsedOf(value), tab);
    if (kind === 'sides' && kept.sides !== undefined) {
      const restored = kept.sides;
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
      }));
      scrolls.forget(`${tab} `);
      for (const [key, offset] of restored.scrolls ?? []) {
        scrolls.keep(`${tab} ${key}`, offset);
      }
    } else if (kind === 'viewer' && kept.viewer !== undefined) {
      const { choices } = kept.viewer;
      set((state) => ({
        view: reduceView(state.view, { type: 'restore', tab, choices }),
      }));
      viewer.restore(tab, kept.viewer);
    } else if (kind === 'editor' && kept.editor !== undefined) {
      editor.restore(tab, kept.editor);
    }
  };
  return {
    changed: (tab: string | undefined) => keeping.changed(tab),
    flush: () => keeping.flush(),
    shown: (message: CommanderToWebviewOf<'show'>) => {
      const kind = kindOf(message);
      kinds.set(message.tab, kind);
      if (message.kept !== undefined && get().view.tab !== message.tab) {
        restore(message.tab, kind, message.kept);
      }
    },
    leaving: (tab: string | undefined) => {
      if (tab !== undefined && tab !== get().view.tab) {
        keeping.left(tab);
      }
    },
    forget: (tab: string, flushed: boolean) => {
      if (flushed) {
        keeping.left(tab);
      }
      keeping.forget(tab);
      kinds.delete(tab);
    },
  };
}
