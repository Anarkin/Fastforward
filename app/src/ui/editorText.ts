import { Facet, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import {
  cellClass,
  cellParts,
  elementWidths,
  type CellTable,
  type TextWidths,
} from './textWidths';
import { breakOffsets, leadLength, wrapColumns, wrapIndent } from './wordWrap';
import { blank, blankSignOf, spacesBlanksAndText } from './blanks';

type LinePart =
  | {
      readonly kind: 'lead';
      readonly from: number;
      readonly to: number;
    }
  | {
      readonly kind: 'break';
      readonly from: number;
      readonly to: number;
    }
  | {
      readonly kind: 'cell';
      readonly from: number;
      readonly to: number;
      readonly cells: number;
      readonly scale: number | undefined;
    };

function boxesIn(text: string, widths: TextWidths | undefined): LinePart[] {
  if (widths?.boxed === undefined) {
    return [];
  }
  const boxes: LinePart[] = [];
  let at = 0;
  for (const part of cellParts(text, widths)) {
    if (part.cells !== undefined) {
      boxes.push({
        kind: 'cell',
        from: at,
        to: at + part.text.length,
        cells: part.cells,
        scale: part.scale,
      });
    }
    at += part.text.length;
  }
  return boxes;
}

export function lineParts(
  text: string,
  indent: number | undefined,
  widths: TextWidths | undefined,
): LinePart[] {
  const boxes = boxesIn(text, widths);
  if (indent === undefined) {
    return boxes;
  }
  const lead = indent > 0 ? leadLength(text) : 0;
  const breaks = breakOffsets(text)
    .filter((at) => at >= lead)
    .map((at): LinePart => ({ kind: 'break', from: at, to: at }));
  return [
    ...(lead > 0 ? [{ kind: 'lead', from: 0, to: lead } as const] : []),
    ...[...breaks, ...boxes].toSorted((a, b) => a.from - b.from),
  ];
}

class BreakChance extends WidgetType {
  override eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    return document.createElement('wbr');
  }
}

const breakChance = Decoration.widget({ widget: new BreakChance() });

const leadMark = Decoration.mark({ class: 'lead' });

const boxMarks = new Map<string, Decoration>();

function boxMark(cells: number, sign?: string): Decoration {
  const key = `${cells} ${sign ?? ''}`;
  let mark = boxMarks.get(key);
  if (mark === undefined) {
    mark = Decoration.mark(
      sign === undefined
        ? { class: cellClass(cells) }
        : {
            class: `blank ${cellClass(cells)}`,
            attributes: { 'data-glyph': sign },
          },
    );
    boxMarks.set(key, mark);
  }
  return mark;
}

const spacesMark = Decoration.mark({ class: 'spaces' });

const signMarks = new Map<string, Decoration>();

function signMark(sign: string): Decoration {
  let mark = signMarks.get(sign);
  if (mark === undefined) {
    mark = Decoration.mark({
      class: 'blank',
      attributes: { 'data-glyph': sign },
    });
    signMarks.set(sign, mark);
  }
  return mark;
}

export const blanksShown = Facet.define<boolean, boolean>({
  combine: (shown) => shown.some((each) => each),
});

const shrunkMark = (scale: number) =>
  Decoration.mark({ attributes: { style: `font-size: ${scale}em` } });

const hangingLine = (indent: number) =>
  Decoration.line({
    attributes: {
      style: `--wrap-indent: calc(${indent} * var(--text-advance))`,
    },
  });

interface LookSets {
  readonly shrunk: DecorationSet;
  readonly boxes: DecorationSet;
  readonly blanks: DecorationSet;
  readonly lines: DecorationSet;
}

function contentWidth(content: HTMLElement): number {
  const style = getComputedStyle(content);
  return (
    content.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight)
  );
}

class LineLook implements PluginValue {
  private widths: TextWidths | undefined;
  private columns: number | undefined;
  private wrapping: boolean;
  sets: LookSets;

  constructor(
    private readonly view: EditorView,
    private readonly table: CellTable,
  ) {
    this.wrapping = view.lineWrapping;
    this.sets = this.build();
  }

  update(update: ViewUpdate): void {
    const measured = update.geometryChanged && this.measure();
    const rewrapped = this.wrapping !== this.view.lineWrapping;
    this.wrapping = this.view.lineWrapping;
    const reblanked =
      update.startState.facet(blanksShown) !== update.state.facet(blanksShown);
    if (
      measured ||
      rewrapped ||
      reblanked ||
      update.docChanged ||
      update.viewportChanged
    ) {
      this.sets = this.build();
    }
  }

  private measure(): boolean {
    const { contentDOM } = this.view;
    if (!contentDOM.isConnected) {
      return false;
    }
    const widths = elementWidths(contentDOM, this.table);
    const columns =
      widths === undefined
        ? undefined
        : wrapColumns(contentWidth(contentDOM), widths.char);
    const changed =
      columns !== this.columns || widths?.char !== this.widths?.char;
    this.widths = widths;
    this.columns = columns;
    return changed;
  }

  private build(): LookSets {
    const { state, visibleRanges } = this.view;
    const shrunk: Range<Decoration>[] = [];
    const boxes: Range<Decoration>[] = [];
    const blanks: Range<Decoration>[] = [];
    const lines: Range<Decoration>[] = [];
    const showsBlanks = state.facet(blanksShown);
    let last = 0;
    for (const { from, to } of visibleRanges) {
      for (let at = from; at <= to;) {
        const line = state.doc.lineAt(at);
        at = line.to + 1;
        if (line.number <= last) {
          continue;
        }
        last = line.number;
        const indent =
          this.wrapping && this.columns !== undefined
            ? wrapIndent(line.text, this.columns)
            : undefined;
        if (indent) {
          lines.push(hangingLine(indent).range(line.from));
        }
        const boxed = new Set<number>();
        for (const part of lineParts(line.text, indent, this.widths)) {
          const partFrom = line.from + part.from;
          const partTo = line.from + part.to;
          if (part.kind === 'lead') {
            lines.push(leadMark.range(partFrom, partTo));
          } else if (part.kind === 'break') {
            lines.push(breakChance.range(partFrom));
          } else {
            const text = line.text.slice(part.from, part.to);
            const signed = showsBlanks && blank.test(text);
            if (signed) {
              boxed.add(part.from);
            }
            boxes.push(
              boxMark(part.cells, signed ? blankSignOf(text) : undefined).range(
                partFrom,
                partTo,
              ),
            );
            if (part.scale !== undefined) {
              shrunk.push(shrunkMark(part.scale).range(partFrom, partTo));
            }
          }
        }
        if (showsBlanks) {
          for (const found of line.text.matchAll(spacesBlanksAndText)) {
            const [part] = found;
            const partFrom = line.from + found.index;
            if (part.startsWith(' ')) {
              blanks.push(spacesMark.range(partFrom, partFrom + part.length));
            } else if (blank.test(part) && !boxed.has(found.index)) {
              blanks.push(
                signMark(blankSignOf(part)).range(
                  partFrom,
                  partFrom + part.length,
                ),
              );
            }
          }
        }
      }
    }
    return {
      shrunk: Decoration.set(shrunk),
      boxes: Decoration.set(boxes),
      blanks: Decoration.set(blanks),
      lines: Decoration.set(lines, true),
    };
  }
}

export function appTextLook(table: CellTable): Extension {
  return [
    EditorView.editorAttributes.of({ class: 'editor-text' }),
    ViewPlugin.define((view) => new LineLook(view, table), {
      provide: (plugin) => [
        EditorView.decorations.of(
          (view) => view.plugin(plugin)?.sets.shrunk ?? Decoration.none,
        ),
        EditorView.decorations.of(
          (view) => view.plugin(plugin)?.sets.boxes ?? Decoration.none,
        ),
        EditorView.decorations.of(
          (view) => view.plugin(plugin)?.sets.blanks ?? Decoration.none,
        ),
        EditorView.decorations.of(
          (view) => view.plugin(plugin)?.sets.lines ?? Decoration.none,
        ),
      ],
    }),
  ];
}
