import { StateEffect, type Extension, type Text } from '@codemirror/state';
import {
  ViewPlugin,
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

const recolored = StateEffect.define();

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

const shownColors = new WeakMap<EditorView, Colors>();

class Colors implements PluginValue {
  private lines: ColoredLines;
  private readonly session: EditedColors;
  colored = 0;

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
      doc.length > limit ? uncolored : this.coloring(view, colorer, language);
    shownColors.set(view, this);
  }

  rangesOf(line: number): readonly SyntaxRange[] | undefined {
    return this.lines[line - 1];
  }

  private coloring(
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
        this.colored += 1;
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
  }

  destroy(): void {
    this.session.stop();
    keepColoredLines(this.view.state.doc, this.language, this.lines);
    if (shownColors.get(this.view) === this) {
      shownColors.delete(this.view);
    }
  }
}

export interface ColorsShown {
  readonly rangesOf: (line: number) => readonly SyntaxRange[] | undefined;
  readonly stamp: unknown;
}

const uncoloredView: ColorsShown = { rangesOf: () => undefined, stamp: 0 };

export function colorsShown(view: EditorView): ColorsShown {
  const colors = shownColors.get(view);
  return colors === undefined
    ? uncoloredView
    : {
        rangesOf: (line) => colors.rangesOf(line),
        stamp: `${colors.colored}`,
      };
}

export function syntaxColors(
  language: string | undefined,
  colorer: () => Colorer,
  limit: number,
): Extension {
  return language === undefined
    ? []
    : ViewPlugin.define((view) => new Colors(view, colorer(), language, limit));
}
