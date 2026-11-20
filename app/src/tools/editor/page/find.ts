import {
  EditorSelection,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
  type Text,
} from '@codemirror/state';
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import type { SearchOptions } from '../../../lib/shared/searchOptions';
import {
  matchesIn,
  searchPattern,
  validSearch,
  type FindRange,
} from '../../../lib/shared/textMatches';

export interface FindQuery {
  readonly text: string;
  readonly options: SearchOptions;
}

export interface Found {
  readonly from: number;
  readonly to: number;
}

interface Finding {
  readonly query: FindQuery | undefined;
  readonly found: readonly Found[];
  readonly capped: boolean;
  readonly invalid: boolean;
}

const maxFound = 10_000;

function rangesIn(doc: Text, { text, options }: FindQuery): FindRange[] {
  if (options.regex) {
    return matchesIn(doc.toString(), text, options, maxFound + 1);
  }
  const ranges: FindRange[] = [];
  let at = 0;
  for (const line of doc.iterLines()) {
    for (const { start, end } of matchesIn(
      line,
      text,
      options,
      maxFound + 1 - ranges.length,
    )) {
      ranges.push({ start: at + start, end: at + end });
    }
    if (ranges.length > maxFound) {
      break;
    }
    at += line.length + 1;
  }
  return ranges;
}

export function foundIn(doc: Text, query: FindQuery): Omit<Finding, 'query'> {
  if (query.text === '' || !validSearch(query.text, query.options)) {
    return { found: [], capped: false, invalid: query.text !== '' };
  }
  const ranges = rangesIn(doc, query);
  return {
    found: ranges
      .slice(0, maxFound)
      .map(({ start, end }) => ({ from: start, to: end })),
    capped: ranges.length > maxFound,
    invalid: false,
  };
}

export function replacedText(
  matched: string,
  query: FindQuery,
  replacement: string,
): string {
  if (!query.options.regex) {
    return replacement;
  }
  const pattern = searchPattern(query.text, query.options);
  return pattern === undefined
    ? replacement
    : matched.replace(
        new RegExp(pattern.source, pattern.flags.replace('g', '')),
        replacement,
      );
}

export const setFind = StateEffect.define<FindQuery | undefined>();

const nothingFound: Finding = {
  query: undefined,
  found: [],
  capped: false,
  invalid: false,
};

const findField = StateField.define<Finding>({
  create: () => nothingFound,
  update(finding, transaction) {
    let { query } = finding;
    for (const effect of transaction.effects) {
      if (effect.is(setFind)) {
        query = effect.value;
      }
    }
    if (query === undefined) {
      return nothingFound;
    }
    return transaction.docChanged || query !== finding.query
      ? { query, ...foundIn(transaction.state.doc, query) }
      : finding;
  },
});

function findingOf(state: EditorState): Finding {
  return state.field(findField, false) ?? nothingFound;
}

export function foundOf(state: EditorState): readonly Found[] {
  return findingOf(state).found;
}

export function findsText(state: EditorState): boolean {
  return (findingOf(state).query?.text ?? '') !== '';
}

function currentOf(state: EditorState): number {
  const { main } = state.selection;
  return findingOf(state).found.findIndex(
    ({ from, to }) => from === main.from && to === main.to,
  );
}

const matchMark = Decoration.mark({ class: 'find-match' });
const currentMark = Decoration.mark({ class: 'find-match current' });

class FindMarks implements PluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.build(view);
  }

  update(update: ViewUpdate): void {
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      findingOf(update.state) !== findingOf(update.startState)
    ) {
      this.decorations = this.build(update.view);
    }
  }

  private build(view: EditorView): DecorationSet {
    const { found } = findingOf(view.state);
    const current = currentOf(view.state);
    const marks: Range<Decoration>[] = [];
    for (const { from, to } of view.visibleRanges) {
      for (const [index, match] of found.entries()) {
        if (match.to >= from && match.from <= to) {
          marks.push(
            (index === current ? currentMark : matchMark).range(
              match.from,
              match.to,
            ),
          );
        }
      }
    }
    return Decoration.set(marks, true);
  }
}

export const editorFind: Extension = [
  findField,
  ViewPlugin.fromClass(FindMarks, {
    decorations: (marks) => marks.decorations,
  }),
];

export function find(view: EditorView, query: FindQuery | undefined): void {
  view.dispatch({ effects: setFind.of(query) });
}

export function step(view: EditorView, direction: 1 | -1): void {
  const { state } = view;
  const { found } = findingOf(state);
  if (found.length === 0) {
    return;
  }
  const { main } = state.selection;
  const next =
    direction > 0
      ? (found.find(({ from }) => from >= main.to) ?? found[0])
      : (found.findLast(({ to }) => to <= main.from) ?? found.at(-1));
  if (next !== undefined) {
    view.dispatch({
      selection: EditorSelection.single(next.from, next.to),
      scrollIntoView: true,
    });
  }
}

export function findNearest(view: EditorView): void {
  const { state } = view;
  const { found } = findingOf(state);
  const { from: at } = state.selection.main;
  const nearest = found.find(({ from }) => from >= at) ?? found.at(0);
  if (nearest !== undefined) {
    view.dispatch({
      selection: EditorSelection.single(nearest.from, nearest.to),
      scrollIntoView: true,
    });
  }
}

export function replace(view: EditorView, replacement: string): void {
  const { state } = view;
  const { query, found } = findingOf(state);
  const current = found[currentOf(state)];
  if (query === undefined || current === undefined) {
    step(view, 1);
    return;
  }
  const inserted = replacedText(
    state.sliceDoc(current.from, current.to),
    query,
    replacement,
  );
  view.dispatch({
    changes: { from: current.from, to: current.to, insert: inserted },
    selection: EditorSelection.cursor(current.from + inserted.length),
    userEvent: 'input.replace',
  });
  step(view, 1);
}

export function replaceAll(view: EditorView, replacement: string): number {
  const { state } = view;
  const { query, found } = findingOf(state);
  if (query === undefined || found.length === 0) {
    return 0;
  }
  view.dispatch({
    changes: found.map(({ from, to }) => ({
      from,
      to,
      insert: replacedText(state.sliceDoc(from, to), query, replacement),
    })),
    userEvent: 'input.replace.all',
  });
  return found.length;
}

export interface FindCount {
  readonly current: number;
  readonly matches: number;
  readonly capped: boolean;
  readonly invalid: boolean;
}

export function keptCount(
  before: FindCount | undefined,
  next: FindCount,
): FindCount {
  return before !== undefined &&
    before.current === next.current &&
    before.matches === next.matches &&
    before.capped === next.capped &&
    before.invalid === next.invalid
    ? before
    : next;
}

export function countOf(state: EditorState): FindCount {
  const { found, capped, invalid } = findingOf(state);
  return {
    current: currentOf(state) + 1,
    matches: found.length,
    capped,
    invalid,
  };
}

export interface FindAsk {
  readonly replace: boolean;
  readonly selected: string;
  readonly at: number;
}

export const findAskOf =
  (withReplace: boolean, state: EditorState | undefined) =>
  (was: FindAsk | undefined): FindAsk => ({
    replace: withReplace,
    selected:
      state === undefined
        ? ''
        : state.sliceDoc(state.selection.main.from, state.selection.main.to),
    at: (was?.at ?? 0) + 1,
  });
