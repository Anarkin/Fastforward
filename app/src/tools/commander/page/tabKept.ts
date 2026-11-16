import { focusSchema, type KeptFocus } from '../../../lib/page/keptFocus';
import { sides, type Side } from '../shared/sides';
import type { CommanderSource, PaneFilter } from './commanderState';
import {
  countOf,
  fieldsOf,
  listOf,
  oneOf,
  optionsOf,
  textOf,
  type Fields,
} from './keptFields';
import { defaultLayouts, layouts, type Layout } from './layouts';
import type { KeptMarks, PaneView } from './paneView';
import { dialogsDecoded, dialogsOf } from './keptDialogs';
import type { Dialogs } from './parkedDialogs';
import type { ScrollPlaces } from './scrollPlaces';
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

export interface TabKept {
  readonly sides?: SidesKept;
}

const marksOf = (pane: PaneView): KeptMarks => ({
  folder: pane.folder,
  selected: pane.selected,
  marked: wholeMarks([...pane.marked]),
});

export function sidesKeptOf(
  state: CommanderSource,
  tab: string,
  scrolls: ScrollPlaces,
): SidesKept | undefined {
  const { view, filters } = state;
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
    scrolls: scrolls
      .under(`${tab} `)
      .filter(([key]) => folders.some((start) => key.startsWith(start))),
    dialogs: dialogsOf(state, tab),
  };
}

const sideKeys = <T>(
  value: unknown,
  each: (item: unknown) => T | undefined,
): Partial<Record<Side, T>> => {
  const fields = fieldsOf(value);
  const decoded: Partial<Record<Side, T>> = {};
  for (const side of sides) {
    const item = each(fields?.(side));
    if (item !== undefined) {
      decoded[side] = item;
    }
  }
  return decoded;
};

function marksDecoded(value: unknown): KeptMarks | undefined {
  const fields = fieldsOf(value);
  const folder = textOf(fields?.('folder'));
  return folder === undefined
    ? undefined
    : {
        folder,
        selected: textOf(fields?.('selected')),
        marked: wholeMarks(listOf(fields?.('marked'), textOf) ?? []),
      };
}

function filterDecoded(value: unknown): PaneFilter | undefined {
  const fields = fieldsOf(value);
  const query = textOf(fields?.('query'));
  const options = optionsOf(fields?.('options'));
  return query === undefined || options === undefined
    ? undefined
    : { folder: textOf(fields?.('folder')), query, options };
}

function scrollDecoded(value: unknown): readonly [string, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) {
    return undefined;
  }
  const key = textOf(value[0]);
  const offset = countOf(value[1]);
  return key === undefined || offset === undefined || offset < 0
    ? undefined
    : [key, offset];
}

const shareDecoded = (value: unknown) => {
  const share = countOf(value);
  return share !== undefined && share > 0 && share < 1 ? share : undefined;
};

function sidesDecoded(fields: Fields, tab: string): SidesKept {
  return {
    active: oneOf(sides, fields('active')),
    share: shareDecoded(fields('share')),
    focus: focusSchema.decode(fields('focus')),
    layouts: sideKeys(fields('layouts'), (item) => oneOf(layouts, item)),
    panes: sideKeys(fields('panes'), marksDecoded),
    filters: sideKeys(fields('filters'), filterDecoded),
    scrolls: listOf(fields('scrolls'), scrollDecoded) ?? [],
    dialogs: dialogsDecoded(tab, fields('dialogs')),
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

export function tabKeptOf(value: unknown, tab: string): TabKept {
  const fields = fieldsOf(value);
  const part = (name: string) => fieldsOf(fields?.(name));
  const sidesPart = part('sides');
  return {
    sides: sidesPart && sidesDecoded(sidesPart, tab),
  };
}
