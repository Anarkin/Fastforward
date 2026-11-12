import type { Extension, Range } from '@codemirror/state';
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

const boxMarks = new Map<number, Decoration>();

function boxMark(cells: number): Decoration {
  let mark = boxMarks.get(cells);
  if (mark === undefined) {
    mark = Decoration.mark({ class: cellClass(cells) });
    boxMarks.set(cells, mark);
  }
  return mark;
}

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
    if (measured || rewrapped || update.docChanged || update.viewportChanged) {
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
    const lines: Range<Decoration>[] = [];
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
        for (const part of lineParts(line.text, indent, this.widths)) {
          const partFrom = line.from + part.from;
          const partTo = line.from + part.to;
          if (part.kind === 'lead') {
            lines.push(leadMark.range(partFrom, partTo));
          } else if (part.kind === 'break') {
            lines.push(breakChance.range(partFrom));
          } else {
            boxes.push(boxMark(part.cells).range(partFrom, partTo));
            if (part.scale !== undefined) {
              shrunk.push(shrunkMark(part.scale).range(partFrom, partTo));
            }
          }
        }
      }
    }
    return {
      shrunk: Decoration.set(shrunk),
      boxes: Decoration.set(boxes),
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
          (view) => view.plugin(plugin)?.sets.lines ?? Decoration.none,
        ),
      ],
    }),
  ];
}
