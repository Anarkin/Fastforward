import type { ScreenRow } from './lines';
import { soughtCopy } from '../../../lib/shared/textMatches';
import type { ShownRows } from './cellPainting';
import {
  heldRows,
  placeUnder,
  pressed,
  reach,
  stillHeld,
} from './cellPointing';
import {
  isEmpty,
  ordered,
  selectedText,
  type TextSelection,
} from './textSelection';

const restMs = 250;

const reachMs = 50;

export interface Selecting {
  readonly shown: () => ShownRows | undefined;
  readonly held: () => readonly ScreenRow[];
  readonly cell: () => { readonly advance: number; readonly rowHeight: number };
  readonly area: () => DOMRect | undefined;
  readonly pressedAs: (press: MouseEvent) => 'start' | 'extend' | undefined;
  readonly changed: () => void;
  readonly began: () => void;
  readonly chosen: (copy: string | undefined) => void;
  readonly move: (rows: number) => void;
}

export class CellSelecting {
  selection: TextSelection | undefined;
  private dragging = false;
  private pointer = { x: 0, y: 0 };
  private reaching: ReturnType<typeof setInterval> | undefined;
  private resting: ReturnType<typeof setTimeout> | undefined;
  private told: string | undefined;

  constructor(
    private readonly host: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly on: Selecting,
  ) {
    host.addEventListener('mousedown', this.down);
    host.ownerDocument.addEventListener('copy', this.copy);
  }

  private under(): ReturnType<typeof placeUnder> {
    const shown = this.on.shown();
    if (shown === undefined) {
      return undefined;
    }
    const box = this.canvas.getBoundingClientRect();
    const scale = box.width > 0 ? this.canvas.width / box.width : 1;
    const { advance, rowHeight } = this.on.cell();
    return placeUnder(
      shown,
      advance,
      rowHeight,
      (this.pointer.x - box.left) * scale,
      (this.pointer.y - box.top) * scale,
    );
  }

  private select(selection: TextSelection | undefined): void {
    this.selection = selection;
    this.on.changed();
    this.tell();
  }

  private copied(): string | undefined {
    const { selection } = this;
    return selection === undefined || isEmpty(selection)
      ? undefined
      : selectedText(selection, heldRows(this.on.held()));
  }

  private tell(): void {
    clearTimeout(this.resting);
    const { selection } = this;
    const oneRow =
      selection !== undefined &&
      ordered(selection).first.start === ordered(selection).last.start;
    const copy = oneRow ? soughtCopy((this.copied() ?? '').trim()) : undefined;
    if (copy === this.told) {
      return;
    }
    if (this.told !== undefined) {
      this.told = undefined;
      this.on.chosen(undefined);
    }
    if (copy !== undefined) {
      this.resting = setTimeout(() => {
        this.told = copy;
        this.on.chosen(copy);
      }, restMs);
    }
  }

  private readonly down = (press: MouseEvent) => {
    const way = this.on.pressedAs(press);
    if (way === undefined) {
      return;
    }
    this.pointer = { x: press.clientX, y: press.clientY };
    const under = this.under();
    if (under === undefined) {
      return;
    }
    const extending = way === 'extend';
    this.on.began();
    this.select(pressed(this.selection, under, press.detail, extending));
    this.dragging = press.detail === 1 || extending;
    const page = this.host.ownerDocument;
    page.addEventListener('mousemove', this.moved);
    page.addEventListener('mouseup', this.up);
  };

  private refocus(): void {
    const under = this.under();
    if (this.selection !== undefined && under !== undefined) {
      this.select({ anchor: this.selection.anchor, focus: under.place });
    }
  }

  private readonly moved = (pointer: MouseEvent) => {
    if (!this.dragging) {
      return;
    }
    this.pointer = { x: pointer.clientX, y: pointer.clientY };
    this.refocus();
    const area = this.on.area();
    const { rowHeight } = this.on.cell();
    const box = this.canvas.getBoundingClientRect();
    const scale = box.width > 0 ? this.canvas.width / box.width : 1;
    const rows =
      area === undefined
        ? 0
        : reach(pointer.clientY - area.top, area.height, rowHeight / scale);
    clearInterval(this.reaching);
    if (rows !== 0) {
      this.reaching = setInterval(() => this.on.move(rows), reachMs);
    }
  };

  private readonly up = () => {
    this.dragging = false;
    clearInterval(this.reaching);
    const page = this.host.ownerDocument;
    page.removeEventListener('mousemove', this.moved);
    page.removeEventListener('mouseup', this.up);
  };

  private readonly copy = (copying: ClipboardEvent) => {
    const copied = this.copied();
    if (
      copied === undefined ||
      this.host.ownerDocument.activeElement?.contains(this.host) !== true
    ) {
      return;
    }
    copying.preventDefault();
    copying.clipboardData?.setData('text/plain', copied);
  };

  clear(): void {
    if (this.selection !== undefined) {
      this.select(undefined);
    }
  }

  rowsChanged(): void {
    if (this.selection === undefined) {
      return;
    }
    if (!stillHeld(this.selection, this.on.held())) {
      this.select(undefined);
    } else if (this.dragging) {
      const under = this.under();
      if (under !== undefined) {
        this.selection = { anchor: this.selection.anchor, focus: under.place };
      }
    }
  }

  dispose(): void {
    this.up();
    clearTimeout(this.resting);
    this.host.removeEventListener('mousedown', this.down);
    this.host.ownerDocument.removeEventListener('copy', this.copy);
  }
}
