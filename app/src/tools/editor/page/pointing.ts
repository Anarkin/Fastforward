import { widthsFor } from '../../../lib/page/textWidths';
import {
  EditorSelection,
  type EditorState,
  type Extension,
  type SelectionRange,
} from '@codemirror/state';
import {
  surfaceEvents,
  surfacePlugin,
  type EditorSurface,
  type SurfacePart,
} from './surface';
import { charAtColumn, columnAt } from '../../../components/cells/page/columns';
import { clicked } from '../../../lib/shared/keymap';
import { editorKeymap } from './keymap';
import { pointerHeld } from './occurrences';
import { gridOf, rowsOf, type Grid } from './grid';
import { charAt } from '../../../components/cells/page/textPlaces';

const reachMs = 50;

const mostRowsAStep = 5;

const mostColumnsAStep = 10;

const pastEdges = (at: number, from: number, to: number): number =>
  at < from ? at - from : at > to ? at - to : 0;

const stepsPast = (past: number, unit: number, most: number): number =>
  past === 0 || !(unit > 0)
    ? 0
    : Math.sign(past) * Math.min(most, Math.ceil(Math.abs(past) / unit));

export interface Pointed {
  readonly pos: number;
  readonly assoc: -1 | 1;
  readonly line: number;
  readonly column: number;
}

function pointedAt(
  view: EditorSurface,
  grid: Grid,
  x: number,
  y: number,
): Pointed {
  const { doc } = view.state;
  const height = y - view.documentTop;
  const block = view.lineBlockAtHeight(height);
  const line = doc.lineAt(block.from);
  const rows = rowsOf(grid, line);
  const index = Math.min(
    rows.length - 1,
    Math.max(0, Math.floor((height - block.top) / grid.rowHeight)),
  );
  const row = rows[index];
  const column = Math.max(0, (x - grid.left) / grid.advance);
  const char =
    row === undefined ? 0 : charAt(grid.widths, line.text, row, column);
  return {
    pos: line.from + char,
    assoc:
      row !== undefined && char === row.to && index < rows.length - 1 ? -1 : 1,
    line: line.number,
    column,
  };
}

export function blockBetween(
  state: EditorState,
  grid: Pick<Grid, 'widths'>,
  from: Pick<Pointed, 'line' | 'column'>,
  to: Pick<Pointed, 'line' | 'column'>,
): SelectionRange[] {
  const ranges: SelectionRange[] = [];
  const first = Math.min(from.line, to.line);
  const last = Math.max(from.line, to.line);
  for (let number = first; number <= last; number++) {
    const line = state.doc.line(number);
    const widths = widthsFor(line.text, grid.widths);
    const charOf = (column: number) =>
      charAtColumn(line.text, 0, line.length, 0, column, widths);
    const anchor = charOf(from.column);
    const head = charOf(to.column);
    const reached = columnAt(line.text, line.length, 0, widths);
    if (
      anchor !== head ||
      first === last ||
      reached >= Math.min(from.column, to.column)
    ) {
      ranges.push(EditorSelection.range(line.from + anchor, line.from + head));
    }
  }
  return ranges;
}

type Grip =
  | {
      readonly kind: 'range';
      readonly anchor: number;
      readonly others: readonly SelectionRange[];
    }
  | {
      readonly kind: 'words' | 'lines';
      readonly from: number;
      readonly to: number;
    }
  | { readonly kind: 'block'; readonly from: Pointed };

function wordOrPlace(state: EditorState, pos: number): SelectionRange {
  return state.wordAt(pos) ?? EditorSelection.cursor(pos);
}

function lineRange(state: EditorState, pos: number): SelectionRange {
  const line = state.doc.lineAt(pos);
  return EditorSelection.range(
    line.from,
    Math.min(state.doc.length, line.to + 1),
  );
}

class Pointing implements SurfacePart {
  private grip: Grip | undefined;
  private holding = false;
  private pointer = { x: 0, y: 0 };
  private reaching: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly view: EditorSurface) {}

  destroy(): void {
    this.holding = false;
    this.up();
  }

  private under(): Pointed | undefined {
    const grid = gridOf(this.view);
    return grid === undefined
      ? undefined
      : pointedAt(this.view, grid, this.pointer.x, this.pointer.y);
  }

  private select(
    ranges: readonly SelectionRange[],
    main = ranges.length - 1,
  ): void {
    if (ranges.length > 0) {
      this.view.dispatch({
        selection: EditorSelection.create(ranges, main),
        userEvent: 'select.pointer',
      });
    }
  }

  pressed(press: MouseEvent): boolean {
    if (press.button !== 0) {
      return false;
    }
    this.pointer = { x: press.clientX, y: press.clientY };
    const under = this.under();
    if (under === undefined) {
      return false;
    }
    press.preventDefault();
    this.view.focus();
    this.holding = true;
    this.view.dispatch({ effects: pointerHeld.of(true) });
    const { state } = this.view;
    const { selection } = state;
    if (clicked(editorKeymap.columnSelection, press) !== undefined) {
      this.grip = { kind: 'block', from: under };
      this.select([EditorSelection.cursor(under.pos, under.assoc)]);
    } else if (press.detail >= 3) {
      const line = lineRange(state, under.pos);
      this.grip = { kind: 'lines', from: line.from, to: line.to };
      this.select([line]);
    } else if (press.detail === 2) {
      const word = wordOrPlace(state, under.pos);
      this.grip = { kind: 'words', from: word.from, to: word.to };
      this.select([word]);
    } else if (clicked(editorKeymap.selectText, press) === 'extend') {
      this.grip = {
        kind: 'range',
        anchor: selection.main.anchor,
        others: selection.ranges.filter((range) => range !== selection.main),
      };
      this.select([
        ...this.grip.others,
        EditorSelection.range(selection.main.anchor, under.pos),
      ]);
    } else if (clicked(editorKeymap.addCursor, press) !== undefined) {
      const others = selection.ranges.filter(
        (range) => !(range.from <= under.pos && under.pos <= range.to),
      );
      if (others.length < selection.ranges.length && others.length > 0) {
        this.grip = undefined;
        this.select(others);
        this.holding = false;
        this.view.dispatch({ effects: pointerHeld.of(false) });
        return true;
      }
      this.grip = { kind: 'range', anchor: under.pos, others };
      this.select([...others, EditorSelection.cursor(under.pos, under.assoc)]);
    } else {
      this.grip = { kind: 'range', anchor: under.pos, others: [] };
      this.select([EditorSelection.cursor(under.pos, under.assoc)]);
    }
    const page = this.view.dom.ownerDocument;
    page.addEventListener('mousemove', this.moved);
    page.addEventListener('mouseup', this.up);
    return true;
  }

  private dragged(): void {
    const { grip } = this;
    const under = this.under();
    if (grip === undefined || under === undefined) {
      return;
    }
    const { state } = this.view;
    if (grip.kind === 'block') {
      const grid = gridOf(this.view);
      if (grid !== undefined) {
        this.select(blockBetween(state, grid, grip.from, under));
      }
    } else if (grip.kind === 'range') {
      this.select([
        ...grip.others,
        EditorSelection.range(grip.anchor, under.pos),
      ]);
    } else {
      const reached =
        grip.kind === 'words'
          ? wordOrPlace(state, under.pos)
          : lineRange(state, under.pos);
      this.select([
        under.pos < grip.from
          ? EditorSelection.range(grip.to, Math.min(reached.from, grip.from))
          : EditorSelection.range(grip.from, Math.max(reached.to, grip.to)),
      ]);
    }
  }

  private readonly moved = (pointer: MouseEvent) => {
    this.pointer = { x: pointer.clientX, y: pointer.clientY };
    this.dragged();
    const { view } = this;
    const scroller = view.scrollDOM;
    const area = scroller.getBoundingClientRect();
    const grid = gridOf(view);
    const row = grid?.rowHeight ?? 0;
    const column = grid?.advance ?? 0;
    const rows = stepsPast(
      pastEdges(pointer.clientY, area.top, area.top + scroller.clientHeight),
      row,
      mostRowsAStep,
    );
    const columns = view.lineWrapping
      ? 0
      : stepsPast(
          pastEdges(
            pointer.clientX,
            area.left +
              (parseFloat(getComputedStyle(view.contentDOM).marginLeft) || 0),
            area.left + scroller.clientWidth,
          ),
          column,
          mostColumnsAStep,
        );
    clearInterval(this.reaching);
    this.reaching = undefined;
    if (rows !== 0 || columns !== 0) {
      this.reaching = setInterval(() => {
        scroller.scrollBy(columns * column, rows * row);
        this.dragged();
      }, reachMs);
    }
  };

  private readonly up = () => {
    this.grip = undefined;
    clearInterval(this.reaching);
    this.reaching = undefined;
    const page = this.view.dom.ownerDocument;
    page.removeEventListener('mousemove', this.moved);
    page.removeEventListener('mouseup', this.up);
    if (this.holding) {
      this.holding = false;
      this.view.dispatch({ effects: pointerHeld.of(false) });
    }
  };
}

const pointing = surfacePlugin((view) => new Pointing(view));

export const editorPointing: Extension = [
  pointing,
  surfaceEvents({
    mousedown: (press, view) => view.plugin(pointing)?.pressed(press) ?? false,
    dragstart: () => true,
  }),
];
