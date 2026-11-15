import type { IDisposable, IMarker, Terminal } from '@xterm/xterm';
import type { CellRange } from '../shared/protocol';

export type PlaceTerminal = Pick<
  Terminal,
  | 'buffer'
  | 'cols'
  | 'registerMarker'
  | 'scrollToLine'
  | 'onScroll'
  | 'getSelectionPosition'
  | 'select'
  | 'onSelectionChange'
>;

export interface PlaceReport {
  scrolled(top: number | undefined): void;
  selected(selection: CellRange | undefined): void;
}

const lengthOf = ({ start, end }: CellRange, columns: number) =>
  (end.y - start.y) * columns + end.x - start.x;

const keyOf = (selection: CellRange | undefined) =>
  JSON.stringify(selection ?? null);

export class PlaceReports {
  private restored = false;
  private disposed = false;
  private normal = false;
  private anchor: IMarker | undefined;
  private selection = keyOf(undefined);
  private readonly listening: readonly IDisposable[];

  constructor(
    private readonly terminal: PlaceTerminal,
    private readonly report: PlaceReport,
  ) {
    this.listening = [
      terminal.onScroll(() => this.scrolled()),
      terminal.onSelectionChange(() => this.selected()),
    ];
  }

  writing(): void {
    this.restored = false;
  }

  restore(top: number | undefined, selection: CellRange | undefined): void {
    const { terminal } = this;
    if (this.disposed) {
      return;
    }
    if (top !== undefined) {
      terminal.scrollToLine(top);
    }
    if (selection !== undefined) {
      terminal.select(
        selection.start.x,
        selection.start.y,
        lengthOf(selection, terminal.cols),
      );
    }
    this.anchorAt(this.topShown());
    this.selection = keyOf(this.selectionShown());
    this.restored = true;
  }

  dispose(): void {
    this.disposed = true;
    this.restored = false;
    for (const listener of this.listening) {
      listener.dispose();
    }
    this.anchor?.dispose();
  }

  private scrolled(): void {
    if (!this.restored) {
      return;
    }
    if (this.terminal.buffer.active.type !== 'normal') {
      this.normal = false;
      return;
    }
    const top = this.topShown();
    const kept =
      top === undefined ? this.anchor === undefined : this.anchor?.line === top;
    if (this.normal && kept) {
      return;
    }
    this.anchorAt(top);
    this.report.scrolled(top);
  }

  private selected(): void {
    if (!this.restored) {
      return;
    }
    const selection = this.selectionShown();
    const key = keyOf(selection);
    if (key !== this.selection) {
      this.selection = key;
      this.report.selected(selection);
    }
  }

  private topShown(): number | undefined {
    const { viewportY, baseY } = this.terminal.buffer.active;
    return viewportY < baseY ? viewportY : undefined;
  }

  private anchorAt(top: number | undefined): void {
    const buffer = this.terminal.buffer.active;
    this.normal = buffer.type === 'normal';
    this.anchor?.dispose();
    this.anchor =
      top === undefined
        ? undefined
        : this.terminal.registerMarker(top - buffer.baseY - buffer.cursorY);
  }

  private selectionShown(): CellRange | undefined {
    const position = this.terminal.getSelectionPosition();
    return position === undefined
      ? undefined
      : {
          start: { x: position.start.x, y: position.start.y },
          end: { x: position.end.x, y: position.end.y },
        };
  }
}
