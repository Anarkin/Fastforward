import { keptFocusFrom, type KeptFocus } from '../../../lib/page/keptFocus';
import { sides, type Side } from '../shared/sides';
import { isTextEncoding } from '../shared/textEncodings';
import type { CommanderSource, PaneFilter } from './commanderState';
import type { KeptEditing } from './editorKept';
import type { EncodingChoice } from './encodings';
import {
  countOf,
  fieldsOf,
  flagOf,
  keptTypedOf,
  listOf,
  oneOf,
  optionsOf,
  searchOf,
  textOf,
  type Fields,
} from './keptFields';
import { defaultLayouts, layouts, type Layout } from './layouts';
import type { KeptMarks, PaneView } from './paneView';
import { dialogsDecoded, dialogsOf } from './keptDialogs';
import type { Dialogs } from './parkedDialogs';
import type { ScrollPlaces } from './scrollPlaces';
import { filterKey } from './sideFilters';
import type { KeptTab, ViewerChoices } from './view';
import type { ViewMode } from './viewerKeymap';
import type { KeptViewer } from './viewerKept';

const maxMarksKept = 5000;

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

export type ViewerKept = Partial<
  Pick<
    KeptViewer,
    | 'finding'
    | 'search'
    | 'current'
    | 'focus'
    | 'sideways'
    | 'preview'
    | 'pdfFind'
  >
> & {
  readonly choices?: ViewerChoices;
  readonly place?: number;
};

export type EditorKept = Partial<KeptEditing>;

export interface TabKept {
  readonly sides?: SidesKept;
  readonly viewer?: ViewerKept;
  readonly editor?: EditorKept;
}

const marksOf = (pane: PaneView): KeptMarks => ({
  folder: pane.folder,
  selected: pane.selected,
  marked: [...pane.marked].slice(0, maxMarksKept),
});

export function sidesKeptOf(
  state: CommanderSource,
  tab: string,
  scrolls: ScrollPlaces,
): SidesKept | undefined {
  const { view, filters } = state;
  const kept: KeptTab | undefined =
    view.tab === tab && view.viewing === undefined && view.editing === undefined
      ? view
      : view.kept.get(tab);
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
        marked: (listOf(fields?.('marked'), textOf) ?? []).slice(
          0,
          maxMarksKept,
        ),
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
    focus: keptFocusFrom(fields('focus')),
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

const modes: readonly ViewMode[] = ['text', 'hex', 'preview'];

function encodingDecoded(value: unknown): EncodingChoice | undefined {
  return value === 'auto' || value === 'bytes' || isTextEncoding(value)
    ? value
    : undefined;
}

function choicesDecoded(value: unknown): ViewerChoices | undefined {
  const fields = fieldsOf(value);
  return (
    fields && {
      mode: oneOf(modes, fields('mode')),
      encoding: encodingDecoded(fields('encoding')),
      language: textOf(fields('language')),
    }
  );
}

function sidewaysDecoded(value: unknown): ViewerKept['sideways'] {
  const fields = fieldsOf(value);
  const body = textOf(fields?.('body'));
  const left = countOf(fields?.('left'));
  const column = countOf(fields?.('column'));
  return body === undefined || left === undefined || column === undefined
    ? undefined
    : { body, left, column };
}

function previewDecoded(value: unknown): ViewerKept['preview'] {
  const fields = fieldsOf(value);
  const top = countOf(fields?.('top'));
  const left = countOf(fields?.('left'));
  const offset = countOf(fields?.('offset'));
  return top === undefined || left === undefined || offset === undefined
    ? undefined
    : { top, left, block: countOf(fields?.('block')), offset };
}

function pdfFindDecoded(value: unknown): ViewerKept['pdfFind'] {
  const fields = fieldsOf(value);
  const search = searchOf(fields?.('search'));
  const current = countOf(fields?.('current'));
  return search === undefined || current === undefined
    ? undefined
    : { search, current };
}

function viewerDecoded(fields: Fields): ViewerKept {
  return {
    choices: choicesDecoded(fields('choices')),
    place: countOf(fields('place')),
    finding: flagOf(fields('finding')),
    search: searchOf(fields('search')),
    current: countOf(fields('current')),
    focus: keptFocusFrom(fields('focus')),
    sideways: sidewaysDecoded(fields('sideways')),
    preview: previewDecoded(fields('preview')),
    pdfFind: pdfFindDecoded(fields('pdfFind')),
  };
}

const encodingToReopen = (value: unknown) =>
  value === 'auto' || isTextEncoding(value) ? value : undefined;

function editorDecoded(fields: Fields): EditorKept {
  const query = searchOf({
    query: fieldsOf(fields('query'))?.('text'),
    options: fieldsOf(fields('query'))?.('options'),
  });
  return {
    finding: flagOf(fields('finding')),
    replacing: flagOf(fields('replacing')),
    query: query && { text: query.query, options: query.options },
    replacement: textOf(fields('replacement')),
    focus: keptFocusFrom(fields('focus')),
    goingToLine: keptTypedOf(fields('goingToLine')),
    reopening: encodingToReopen(fields('reopening')),
  };
}

export function tabKeptOf(value: unknown, tab: string): TabKept {
  const fields = fieldsOf(value);
  const part = (name: string) => fieldsOf(fields?.(name));
  const sidesPart = part('sides');
  const viewerPart = part('viewer');
  const editorPart = part('editor');
  return {
    sides: sidesPart && sidesDecoded(sidesPart, tab),
    viewer: viewerPart && viewerDecoded(viewerPart),
    editor: editorPart && editorDecoded(editorPart),
  };
}
