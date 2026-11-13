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

export interface FindQuery {
  readonly text: string;
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly regex: boolean;
}

interface Found {
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

const specialCharacters = /[.*+?^${}()|[\]\\]/g;

function patternOf(query: FindQuery): RegExp | undefined {
  if (query.text === '') {
    return undefined;
  }
  const source = query.regex
    ? query.text
    : query.text.replace(specialCharacters, (character) => `\\${character}`);
  const bounded = query.wholeWord
    ? `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
    : source;
  try {
    return new RegExp(bounded, `gmu${query.caseSensitive ? '' : 'i'}`);
  } catch {
    return undefined;
  }
}

export function foundIn(doc: Text, query: FindQuery): Omit<Finding, 'query'> {
  const pattern = patternOf(query);
  if (pattern === undefined) {
    return { found: [], capped: false, invalid: query.text !== '' };
  }
  const text = doc.toString();
  const found: Found[] = [];
  for (
    let match = pattern.exec(text);
    match !== null;
    match = pattern.exec(text)
  ) {
    if (match[0] === '') {
      pattern.lastIndex += 1;
      continue;
    }
    if (found.length === maxFound) {
      return { found, capped: true, invalid: false };
    }
    found.push({ from: match.index, to: match.index + match[0].length });
  }
  return { found, capped: false, invalid: false };
}

export function replacedText(
  matched: string,
  query: FindQuery,
  replacement: string,
): string {
  if (!query.regex) {
    return replacement;
  }
  const pattern = patternOf(query);
  return pattern === undefined
    ? replacement
    : matched.replace(
        new RegExp(pattern.source, pattern.flags.replace('g', '')),
        replacement,
      );
}

const setFind = StateEffect.define<FindQuery | undefined>();

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

export function countOf(state: EditorState): {
  readonly current: number;
  readonly matches: number;
  readonly capped: boolean;
  readonly invalid: boolean;
} {
  const { found, capped, invalid } = findingOf(state);
  return {
    current: currentOf(state) + 1,
    matches: found.length,
    capped,
    invalid,
  };
}
