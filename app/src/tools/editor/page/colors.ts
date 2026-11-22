import {
  StateEffect,
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
import type {
  Colorer,
  EditedColors,
} from '../../../components/syntax/page/colorer';
import { partLines } from '../../../components/syntax/page/parts';
import { replacedIn } from '../../../lib/page/replacedIn';
import type { SyntaxRange } from '../../../components/syntax/page/engine';
import { hasSwapped } from '../../../lib/page/controlPictures';
import {
  lineColors,
  type ColoredRange,
} from '../../../components/syntax/page/lineColors';

const recolored = StateEffect.define();

const kindMarks = new Map<string, Decoration>();

function markOf(
  kind: string,
  inclusiveStart = false,
  inclusiveEnd = false,
): Decoration {
  const key = `${kind} ${inclusiveStart} ${inclusiveEnd}`;
  let mark = kindMarks.get(key);
  if (mark === undefined) {
    mark = Decoration.mark({
      class: `syntax-${kind}`,
      inclusiveStart,
      inclusiveEnd,
    });
    kindMarks.set(key, mark);
  }
  return mark;
}

const kindLines = new Map<string, Decoration>();

function lineOf(kind: string): Decoration {
  let line = kindLines.get(kind);
  if (line === undefined) {
    line = Decoration.line({ class: `syntax-${kind}` });
    kindLines.set(kind, line);
  }
  return line;
}

interface LineColors {
  readonly common: string | undefined;
  readonly others: readonly ColoredRange[];
}

const coloredLines = new WeakMap<
  readonly SyntaxRange[],
  { readonly text: string; readonly colors: LineColors }
>();

export function colorsOfLine(
  text: string,
  tokens: readonly SyntaxRange[],
): LineColors {
  const kept = coloredLines.get(tokens);
  if (kept?.text === text) {
    return kept.colors;
  }
  const colors = lineColors(text, tokens);
  coloredLines.set(tokens, { text, colors });
  return colors;
}

function linesOf(doc: Text, first: number, last: number): string[] {
  const lines: string[] = [];
  for (let number = first + 1; number <= last + 1; number++) {
    lines.push(doc.line(number).text);
  }
  return lines;
}

export interface LineEdit {
  readonly from: number;
  readonly removed: number;
  readonly lines: readonly string[];
}

export function lineEdit(
  update: Pick<ViewUpdate, 'changes' | 'startState' | 'state'>,
): LineEdit | undefined {
  let fromA = Infinity;
  let toA = -Infinity;
  let toB = -Infinity;
  update.changes.iterChangedRanges(
    (changedFromA, changedToA, _fromB, changedToB) => {
      fromA = Math.min(fromA, changedFromA);
      toA = Math.max(toA, changedToA);
      toB = Math.max(toB, changedToB);
    },
  );
  if (fromA === Infinity) {
    return undefined;
  }
  const before = update.startState.doc;
  const after = update.state.doc;
  const from = before.lineAt(fromA).number - 1;
  const lastBefore = before.lineAt(toA).number - 1;
  const lastAfter = after.lineAt(toB).number - 1;
  return {
    from,
    removed: lastBefore - from + 1,
    lines: linesOf(after, from, lastAfter),
  };
}

interface LineSpan {
  readonly from: number;
  readonly count: number;
}

export function linesMeet(
  { from, count }: LineSpan,
  shown: { readonly first: number; readonly last: number },
): boolean {
  return count > 0 && from <= shown.last && from + count > shown.first;
}

function shownLines(view: EditorView): { first: number; last: number } {
  const { doc } = view.state;
  const { from, to } = view.viewport;
  return {
    first: doc.lineAt(from).number - 1,
    last: doc.lineAt(to).number - 1,
  };
}

const uncolored: EditedColors = { edit: () => {}, stop: () => {} };

const uncoloredLine: LineColors = { common: undefined, others: [] };

type ColoredLines = (readonly SyntaxRange[] | undefined)[];

const coloredTexts = new WeakMap<
  Text,
  { readonly language: string; readonly lines: ColoredLines }
>();

export function coloredLinesOf(
  doc: Text,
  language: string,
): ColoredLines | undefined {
  const kept = coloredTexts.get(doc);
  return kept?.language === language && kept.lines.length === doc.lines
    ? [...kept.lines]
    : undefined;
}

export function keepColoredLines(
  doc: Text,
  language: string,
  lines: ColoredLines,
): void {
  coloredTexts.set(doc, { language, lines });
}

class Colors implements PluginValue {
  private lines: ColoredLines;
  private readonly session: EditedColors;
  decorations: DecorationSet;

  constructor(
    private readonly view: EditorView,
    colorer: Colorer,
    private readonly language: string,
    limit: number,
  ) {
    const { doc } = view.state;
    this.lines =
      coloredLinesOf(doc, language) ??
      Array.from({ length: doc.lines }, () => undefined);
    this.session =
      doc.length > limit ? uncolored : this.colored(view, colorer, language);
    this.decorations = this.build(view);
  }

  private colored(
    view: EditorView,
    colorer: Colorer,
    language: string,
  ): EditedColors {
    const { doc } = view.state;
    return colorer.colorEdited(
      language,
      linesOf(doc, 0, doc.lines - 1),
      (part) => {
        if (part === undefined) {
          return;
        }
        const lines = partLines(part);
        lines.forEach((ranges, index) => {
          this.lines[part.from + index] = ranges;
        });
        if (
          linesMeet({ from: part.from, count: lines.length }, shownLines(view))
        ) {
          view.dispatch({ effects: recolored.of(null) });
        }
      },
    );
  }

  update(update: ViewUpdate): void {
    const edit = update.docChanged ? lineEdit(update) : undefined;
    if (edit !== undefined) {
      this.lines = replacedIn(
        this.lines,
        edit.from,
        edit.removed,
        edit.lines.map((_, at) =>
          at < edit.removed ? this.lines[edit.from + at] : undefined,
        ),
      );
      this.session.edit(edit.from, edit.removed, edit.lines);
    }
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(recolored)),
      )
    ) {
      this.decorations = this.build(update.view);
    }
  }

  destroy(): void {
    this.session.stop();
    keepColoredLines(this.view.state.doc, this.language, this.lines);
  }

  private build(view: EditorView): DecorationSet {
    const { doc } = view.state;
    const marks: Range<Decoration>[] = [];
    let classed = 0;
    for (const { from, to } of view.visibleRanges) {
      for (let at = from; at <= to;) {
        const line = doc.lineAt(at);
        at = line.to + 1;
        const windowFrom = Math.max(from, line.from) - line.from;
        const windowTo = Math.min(to, line.to) - line.from;
        const pictured = hasSwapped(line.text);
        const tokens = this.lines[line.number - 1];
        const { common, others } =
          tokens === undefined || tokens.length === 0
            ? uncoloredLine
            : colorsOfLine(line.text, tokens);
        if (common !== undefined && classed !== line.number) {
          classed = line.number;
          marks.push(lineOf(common).range(line.from));
        }
        for (const { start, end, kind } of tokensIn(
          others,
          windowFrom,
          windowTo,
        )) {
          const markFrom = Math.max(start, windowFrom);
          const markTo = Math.min(end, windowTo, line.length);
          if (markFrom < markTo) {
            marks.push(
              markOf(
                kind,
                pictured && hasSwapped(line.text.charAt(markFrom)),
                pictured && hasSwapped(line.text.charAt(markTo - 1)),
              ).range(line.from + markFrom, line.from + markTo),
            );
          }
        }
      }
    }
    return Decoration.set(marks, true);
  }
}

export function tokensIn<Token extends { start: number; end: number }>(
  tokens: readonly Token[],
  from: number,
  to: number,
): Token[] {
  let low = 0;
  let high = tokens.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((tokens[middle]?.end ?? 0) <= from) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const found: Token[] = [];
  for (let index = low; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === undefined || token.start >= to) {
      break;
    }
    found.push(token);
  }
  return found;
}

export function syntaxColors(
  language: string | undefined,
  colorer: () => Colorer,
  limit: number,
): Extension {
  return language === undefined
    ? []
    : ViewPlugin.define(
        (view) => new Colors(view, colorer(), language, limit),
        { decorations: (colors) => colors.decorations },
      );
}
