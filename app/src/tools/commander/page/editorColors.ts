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
import type { Colorer, EditedColors } from '../../../lib/page/syntax';
import { replacedIn, type SyntaxRange } from '../../../lib/page/syntaxEngine';
import { partLines } from '../../../lib/page/syntaxParts';

const recolored = StateEffect.define();

const kindMarks = new Map<SyntaxRange['kind'], Decoration>();

function markOf(kind: SyntaxRange['kind']): Decoration {
  let mark = kindMarks.get(kind);
  if (mark === undefined) {
    mark = Decoration.mark({ class: `syntax-${kind}` });
    kindMarks.set(kind, mark);
  }
  return mark;
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

const uncolored: EditedColors = { edit: () => {}, stop: () => {} };

class Colors implements PluginValue {
  private lines: (readonly SyntaxRange[] | undefined)[];
  private readonly session: EditedColors;
  decorations: DecorationSet;

  constructor(
    view: EditorView,
    colorer: Colorer,
    language: string,
    limit: number,
  ) {
    const { doc } = view.state;
    this.lines = Array.from({ length: doc.lines }, () => undefined);
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
        partLines(part).forEach((ranges, index) => {
          this.lines[part.from + index] = ranges;
        });
        view.dispatch({ effects: recolored.of(null) });
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
  }

  private build(view: EditorView): DecorationSet {
    const { doc } = view.state;
    const marks: Range<Decoration>[] = [];
    for (const { from, to } of view.visibleRanges) {
      for (let at = from; at <= to;) {
        const line = doc.lineAt(at);
        at = line.to + 1;
        const windowFrom = Math.max(from, line.from) - line.from;
        const windowTo = Math.min(to, line.to) - line.from;
        for (const { start, end, kind } of tokensIn(
          this.lines[line.number - 1] ?? [],
          windowFrom,
          windowTo,
        )) {
          const markFrom = Math.max(start, windowFrom);
          const markTo = Math.min(end, windowTo, line.length);
          if (markFrom < markTo) {
            marks.push(
              markOf(kind).range(line.from + markFrom, line.from + markTo),
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
