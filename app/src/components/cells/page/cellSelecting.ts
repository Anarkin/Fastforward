import type { ScreenRow } from './lines';
import { soughtCopy } from '../../../lib/shared/textMatches';
import type { ShownRows } from './cellPainting';
import {
  heldRows,
  placedUnder,
  placeUnder,
  pressed,
  reach,
  stillHeld,
} from './cellPointing';
import {
  isEmpty,
  keptText,
  ordered,
  type KeptText,
  type TextSelection,
} from './textSelection';

const reachMs = 50;

export interface Selecting {
  readonly shown: () => ShownRows | undefined;
  readonly held: () => readonly ScreenRow[];
  readonly partial: () => boolean;
  readonly cell: () => { readonly advance: number; readonly rowHeight: number };
  readonly area: () => DOMRect | undefined;
  readonly pressedAs: (press: MouseEvent) => 'start' | 'extend' | undefined;
  readonly changed: () => void;
  readonly began: () => void;
  readonly chosen: (copy: string | undefined) => void;
  readonly kept?: (kept: KeptText | undefined) => void;
  readonly move: (rows: number) => void;
  readonly copiedWhole?: () => void;
}

export class CellSelecting {
  selection: TextSelection | undefined;
  private dragging = false;
  private pointer = { x: 0, y: 0 };
  private reaching: ReturnType<typeof setInterval> | undefined;
  private told: string | undefined;
  private kept: KeptText | undefined;
  private whole: TextSelection | undefined;

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

  private textOf(selection: TextSelection): string | undefined {
    const shape = this.on.shown()?.shape;
    return keptText(
      this.kept,
      selection,
      heldRows(this.on.held()),
      shape?.text,
    );
  }

  private taken(selection: TextSelection): TextSelection {
    const text = this.textOf(selection);
    const taken =
      text === undefined
        ? { anchor: selection.focus, focus: selection.focus }
        : selection;
    this.kept = { selection: taken, text: text ?? '' };
    return taken;
  }

  private select(selection: TextSelection | undefined): void {
    this.selection =
      selection === undefined ? undefined : this.taken(selection);
    if (selection === undefined) {
      this.kept = undefined;
    }
    this.on.changed();
    this.tell();
    if (!this.dragging) {
      this.on.kept?.(this.kept);
    }
  }

  selectAll(selection: TextSelection, text: string | undefined): void {
    this.selection = selection;
    this.kept = text === undefined ? undefined : { selection, text };
    this.whole = text === undefined ? selection : undefined;
    this.on.changed();
    this.tell();
    this.on.kept?.(this.kept);
  }

  restore(kept: KeptText | undefined): void {
    this.selection = kept?.selection;
    this.kept = kept;
    this.on.changed();
    const copy = this.copyOf();
    if (copy !== this.told) {
      this.told = copy;
      this.on.chosen(copy);
    }
  }

  private copied(): string | undefined {
    const { selection } = this;
    const text =
      selection === undefined || isEmpty(selection)
        ? undefined
        : this.textOf(selection);
    const shape = this.on.shown()?.shape;
    return text === undefined || selection === undefined || shape === undefined
      ? text
      : shape.clip(text, selection, heldRows(this.on.held()));
  }

  private copyOf(): string | undefined {
    const { selection } = this;
    const shape = this.on.shown()?.shape;
    if (shape !== undefined) {
      return selection === undefined || isEmpty(selection)
        ? undefined
        : shape.sought(selection, heldRows(this.on.held()));
    }
    const oneRow =
      selection !== undefined &&
      ordered(selection).first.start === ordered(selection).last.start;
    return oneRow ? soughtCopy(this.kept?.text ?? '') : undefined;
  }

  private tell(): void {
    const copy = this.dragging ? undefined : this.copyOf();
    if (copy === this.told) {
      return;
    }
    this.told = copy;
    this.on.chosen(copy);
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
    this.dragging = press.detail === 1 || extending;
    this.select(
      pressed(
        this.selection,
        under,
        press.detail,
        extending,
        this.on.shown()?.shape,
      ),
    );
    const page = this.host.ownerDocument;
    page.addEventListener('mousemove', this.moved);
    page.addEventListener('mouseup', this.up);
  };

  private refocus(): void {
    const under = this.under();
    if (this.selection !== undefined && under !== undefined) {
      this.select({
        anchor: this.selection.anchor,
        focus: placedUnder(
          under,
          this.selection.anchor,
          this.on.shown()?.shape,
        ),
      });
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
    const dragged = this.dragging;
    this.dragging = false;
    clearInterval(this.reaching);
    const page = this.host.ownerDocument;
    page.removeEventListener('mousemove', this.moved);
    page.removeEventListener('mouseup', this.up);
    if (dragged) {
      this.on.kept?.(this.kept);
      this.tell();
    }
  };

  private readonly copy = (copying: ClipboardEvent) => {
    if (this.host.ownerDocument.activeElement?.contains(this.host) !== true) {
      return;
    }
    if (this.whole !== undefined && this.whole === this.selection) {
      copying.preventDefault();
      this.on.copiedWhole?.();
      return;
    }
    const copied = this.copied();
    if (copied === undefined) {
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
    const { selection } = this;
    if (selection === undefined) {
      return;
    }
    const held = this.on.held();
    if (
      held.length === 0 ||
      (!this.on.partial() && !stillHeld(selection, held))
    ) {
      this.select(undefined);
    } else if (this.dragging) {
      const under = this.under();
      if (under !== undefined) {
        this.selection = this.taken({
          anchor: selection.anchor,
          focus: placedUnder(under, selection.anchor, this.on.shown()?.shape),
        });
      }
    }
  }

  dispose(): void {
    this.up();
    this.host.removeEventListener('mousedown', this.down);
    this.host.ownerDocument.removeEventListener('copy', this.copy);
  }
}
