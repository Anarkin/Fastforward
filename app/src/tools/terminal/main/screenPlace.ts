import type { IMarker, Terminal } from '@xterm/headless';
import type { CellRange } from '../shared/protocol';

export interface Place {
  readonly top: number | undefined;
  readonly selection: CellRange | undefined;
}

interface KeptSelection {
  readonly start: IMarker | undefined;
  readonly startX: number;
  readonly end: IMarker | undefined;
  readonly endX: number;
}

export class KeptPlace {
  private top: IMarker | undefined;
  private selection: KeptSelection | undefined;
  private rows: number;

  constructor(private readonly terminal: Terminal) {
    this.rows = terminal.rows;
    terminal.buffer.onBufferChange(() => this.forget());
    terminal.onResize(({ rows }) => {
      if (rows !== this.rows) {
        this.rows = rows;
        this.unselect();
      }
    });
    terminal.parser.registerEscHandler({ final: 'c' }, () => {
      this.forget();
      return false;
    });
  }

  scrolled(top: number | undefined): void {
    this.top?.dispose();
    this.top = top === undefined ? undefined : this.markerAt(top);
  }

  selected(selection: CellRange | undefined): void {
    this.unselect();
    if (selection !== undefined) {
      this.selection = {
        start: this.markerAt(selection.start.y),
        startX: this.columnOf(selection.start.x),
        end: this.markerAt(selection.end.y),
        endX: this.columnOf(selection.end.x),
      };
    }
  }

  place(): Place {
    const { top, selection } = this;
    return {
      top: top === undefined ? undefined : Math.max(top.line, 0),
      selection:
        selection?.end === undefined || selection.end.isDisposed
          ? undefined
          : {
              start:
                selection.start === undefined || selection.start.isDisposed
                  ? { x: 0, y: 0 }
                  : { x: selection.startX, y: selection.start.line },
              end: { x: selection.endX, y: selection.end.line },
            },
    };
  }

  private forget(): void {
    this.scrolled(undefined);
    this.unselect();
  }

  private unselect(): void {
    this.selection?.start?.dispose();
    this.selection?.end?.dispose();
    this.selection = undefined;
  }

  private markerAt(line: number): IMarker | undefined {
    const buffer = this.terminal.buffer.active;
    const at = Math.min(Math.max(line, 0), buffer.length - 1);
    return this.terminal.registerMarker(at - buffer.baseY - buffer.cursorY);
  }

  private columnOf(column: number): number {
    return Math.min(Math.max(column, 0), this.terminal.cols);
  }
}
