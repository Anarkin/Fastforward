import type { KeptFocus } from '../../../lib/page/viewFocus';
import { sides, type Side } from '../shared/sides';
import type { CommanderSource, PaneFilter } from './state';
import { defaultLayouts, type Layout } from './layouts';
import type { KeptMarks, PaneView } from './paneView';
import { dialogsOf } from './dialogs';
import {
  commanderViewSchema,
  type KeptDialogs,
  type SidesView,
} from './tabView';
import type { Dialogs } from './parkedDialogs';
import { filterKey } from './sideFilters';
import type { KeptTab } from './view';

const maxMarksKept = 5000;

const marksLength = 128 * 1024;

const wholeMarks = (marked: readonly string[]): readonly string[] =>
  marked.length > maxMarksKept ||
  marked.reduce((length, name) => length + name.length, 0) > marksLength
    ? []
    : marked;

export interface SidesKept {
  readonly active?: Side;
  readonly share?: number;
  readonly focus?: KeptFocus;
  readonly layouts?: Partial<Record<Side, Layout>>;
  readonly panes?: Partial<Record<Side, KeptMarks>>;
  readonly filters?: Partial<Record<Side, PaneFilter>>;
  readonly scrolls?: readonly (readonly [string, number])[];
  readonly dialogs?: Dialogs;
}

const marksOf = (pane: PaneView): KeptMarks => ({
  folder: pane.folder,
  selected: pane.selected,
  marked: wholeMarks([...pane.marked]),
});

export function sidesKeptOf(
  state: CommanderSource,
  tab: string,
): SidesKept | undefined {
  const { view, filters, scrolls } = state;
  const kept: KeptTab | undefined =
    view.tab === tab ? view : view.kept.get(tab);
  if (kept === undefined) {
    return undefined;
  }
  const panes: Partial<Record<Side, KeptMarks>> = {};
  const filtered: Partial<Record<Side, PaneFilter>> = {};
  const folders: string[] = [];
  for (const side of sides) {
    const pane = kept.panes[side];
    const marks = pane === undefined ? kept.awaiting?.[side] : marksOf(pane);
    if (marks !== undefined) {
      panes[side] = marks;
      folders.push(`${side} ${marks.folder} `);
    }
    const filter = filters.get(filterKey(tab, side));
    if (filter !== undefined) {
      filtered[side] = filter;
    }
  }
  return {
    active: kept.active,
    share: kept.share,
    focus: kept.focus,
    layouts: kept.layouts,
    panes,
    filters: filtered,
    scrolls: [...scrolls]
      .filter(([key]) => key.startsWith(`${tab} `))
      .map(([key, offset]) => [key.slice(`${tab} `.length), offset] as const)
      .filter(([key]) => folders.some((start) => key.startsWith(start))),
    dialogs: dialogsOf(state, tab),
  };
}

export function keptTabOf(kept: SidesKept): KeptTab {
  return {
    active: kept.active ?? 'right',
    share: kept.share ?? 0.5,
    focus: kept.focus,
    layouts: { ...defaultLayouts, ...kept.layouts },
    panes: { left: undefined, right: undefined },
    awaiting: { left: kept.panes?.left, right: kept.panes?.right },
  };
}

export function sidesViewOf(kept: SidesKept): string | undefined {
  const encoded = commanderViewSchema.encode({
    ...kept,
    scrolls: kept.scrolls === undefined ? undefined : new Map(kept.scrolls),
  });
  return encoded === undefined ? undefined : JSON.stringify(encoded);
}

function marksFrom(
  marks: NonNullable<NonNullable<SidesView['panes']>['left']> | undefined,
): KeptMarks | undefined {
  return (
    marks && {
      folder: marks.folder,
      selected: marks.selected,
      marked: wholeMarks(marks.marked ?? []),
    }
  );
}

function filterFrom(
  filter: NonNullable<NonNullable<SidesView['filters']>['left']> | undefined,
): PaneFilter | undefined {
  return (
    filter && {
      folder: filter.folder,
      query: filter.query,
      options: filter.options,
    }
  );
}

function dialogsFrom(tab: string, kept: KeptDialogs | undefined): Dialogs {
  const dialogs: { -readonly [K in keyof Dialogs]: Dialogs[K] } = {};
  if (kept === undefined) {
    return dialogs;
  }
  const { deleting, transferring, packing } = kept;
  if (deleting !== undefined) {
    dialogs.deleting = { ...deleting, tab };
  }
  if (transferring !== undefined) {
    dialogs.transferring = { ...transferring, tab };
  }
  for (const slot of ['makingFolder', 'makingFile', 'goingTo'] as const) {
    const prompt = kept[slot];
    if (prompt !== undefined) {
      dialogs[slot] = { ...prompt, tab };
    }
  }
  if (kept.renaming !== undefined) {
    dialogs.renaming = { ...kept.renaming, tab };
  }
  if (kept.copyingAs !== undefined) {
    dialogs.copyingAs = { ...kept.copyingAs, tab };
  }
  if (kept.markingPattern !== undefined) {
    dialogs.markingPattern = { ...kept.markingPattern, tab };
  }
  if (packing !== undefined) {
    const { form, ...rest } = packing;
    dialogs.packing = {
      ...rest,
      tab,
      ...(form !== undefined && {
        form: {
          ...form,
          password: '',
          shown: form.shown === true,
          encryptNames: form.encryptNames === true,
          splitting: form.splitting === true,
          testing: form.testing !== false,
        },
      }),
    };
  }
  return dialogs;
}

export function sidesKeptFrom(
  value: unknown,
  tab: string,
): SidesKept | undefined {
  const view = commanderViewSchema.decode(value);
  if (view === undefined) {
    return undefined;
  }
  const panes: Partial<Record<Side, KeptMarks>> = {};
  const filters: Partial<Record<Side, PaneFilter>> = {};
  for (const each of sides) {
    const marks = marksFrom(view.panes?.[each]);
    if (marks !== undefined) {
      panes[each] = marks;
    }
    const filter = filterFrom(view.filters?.[each]);
    if (filter !== undefined) {
      filters[each] = filter;
    }
  }
  return {
    active: view.active,
    share: view.share,
    focus: view.focus,
    layouts: view.layouts,
    panes,
    filters,
    scrolls: view.scrolls === undefined ? [] : [...view.scrolls],
    dialogs: dialogsFrom(tab, view.dialogs),
  };
}
