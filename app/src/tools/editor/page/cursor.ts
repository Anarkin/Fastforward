import { type Extension, type SelectionRange } from '@codemirror/state';
import type { CursorLook } from '../../../lib/shared/cursorSettings';
import {
  CursorMark,
  blinkAnew,
  drawnCursor,
  type DrawnCursor,
} from '../../../lib/page/cursor';
import type { Box } from '../../../lib/page/pixelBoxes';
import { cellAt, gridOf, type Grid } from './grid';
import { underAt } from '../../../components/cells/page/textPlaces';
import { layerOrigin } from './rows';
import {
  surfacePlugin,
  type EditorSurface,
  type SurfacePart,
  type SurfaceUpdate,
} from './surface';

interface CursorCell {
  readonly cell: Box;
  readonly text: string;
  readonly font: string;
}

function cursorCell(
  view: EditorSurface,
  grid: Grid,
  font: string,
  range: SelectionRange,
): CursorCell {
  const { head } = range;
  const line = view.state.doc.lineAt(head);
  const char = head - line.from;
  return {
    cell: cellAt(view, grid, head, range.assoc || 1),
    text: underAt(line.text, char),
    font,
  };
}

interface Marker {
  readonly className: string;
  readonly drawn: DrawnCursor;
}

function cursorMarkers(view: EditorSurface, look: CursorLook): Marker[] {
  const grid = gridOf(view);
  if (grid === undefined) {
    return [];
  }
  const origin = layerOrigin(view);
  const font = getComputedStyle(view.contentDOM).font;
  const { selection } = view.state;
  return selection.ranges.map((range) => ({
    className:
      range === selection.main
        ? 'editor-cursor editor-cursor-primary'
        : 'editor-cursor editor-cursor-secondary',
    drawn: drawnCursor({
      ...cursorCell(view, grid, font, range),
      shape: look.style,
      thickness: look.width,
      ratio: devicePixelRatio,
      origin,
    }),
  }));
}

class Cursors implements SurfacePart {
  private readonly layer: HTMLDivElement;
  private shown: { readonly className: string; readonly mark: CursorMark }[] =
    [];

  constructor(
    private readonly view: EditorSurface,
    private readonly look: CursorLook,
  ) {
    this.layer = view.dom.ownerDocument.createElement('div');
    this.layer.className = 'editor-cursors';
    blinkAnew(this.layer, look.blink);
    view.scrollDOM.append(this.layer);
    this.draw();
  }

  update(update: SurfaceUpdate): void {
    if (update.transactions.some((transaction) => transaction.selection)) {
      blinkAnew(this.layer, this.look.blink);
    }
    if (
      update.transactions.length > 0 ||
      update.geometryChanged ||
      update.heightChanged
    ) {
      this.draw();
    }
  }

  destroy(): void {
    this.layer.remove();
  }

  private draw(): void {
    const markers = cursorMarkers(this.view, this.look);
    for (const [at, marker] of markers.entries()) {
      let kept = this.shown[at];
      if (kept?.className !== marker.className) {
        const made = this.layer.ownerDocument.createElement('div');
        made.className = marker.className;
        if (kept === undefined) {
          this.layer.append(made);
        } else {
          kept.mark.element.replaceWith(made);
        }
        kept = { className: marker.className, mark: new CursorMark(made) };
        this.shown[at] = kept;
      }
      kept.mark.paint(marker.drawn);
    }
    for (const left of this.shown.splice(markers.length)) {
      left.mark.hide();
    }
  }
}

export function cursorLayer(look: CursorLook): Extension {
  return surfacePlugin((view) => new Cursors(view, look));
}
