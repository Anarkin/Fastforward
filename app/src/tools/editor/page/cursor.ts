import { clusterBreak } from '../../../lib/page/graphemes';
import { type Extension, type SelectionRange } from '@codemirror/state';
import type { CursorLook } from '../../../lib/shared/cursorSettings';
import {
  blinkAnimation,
  drawnCursor,
  paintCursor,
  sameDrawing,
  type DrawnCursor,
} from '../../../lib/page/cursor';
import type { Box } from '../../../lib/page/pixelBoxes';
import { cellAt, gridOf, type Grid } from './grid';
import { shownUnder } from '../../../components/cells/page/textPlaces';
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
  const text =
    char >= line.length
      ? ''
      : line.text.slice(char, clusterBreak(line.text, char, true));
  return {
    cell: cellAt(view, grid, head, range.assoc || 1),
    text: shownUnder(text),
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

function blinking(look: CursorLook, again: boolean): string {
  return look.blink ? blinkAnimation(again) : 'none';
}

class Cursors implements SurfacePart {
  private readonly layer: HTMLDivElement;
  private shown: Marker[] = [];

  constructor(
    private readonly view: EditorSurface,
    private readonly look: CursorLook,
  ) {
    this.layer = view.dom.ownerDocument.createElement('div');
    this.layer.className = 'editor-cursors';
    this.layer.style.animation = blinking(look, false);
    view.scrollDOM.append(this.layer);
    this.draw();
  }

  update(update: SurfaceUpdate): void {
    if (update.transactions.some((transaction) => transaction.selection)) {
      this.layer.style.animation = blinking(
        this.look,
        this.layer.style.animationName === 'cursor-blink',
      );
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
    const { children } = this.layer;
    for (const [at, marker] of markers.entries()) {
      const before = this.shown[at];
      const element = children[at];
      if (
        element instanceof HTMLElement &&
        before?.className === marker.className
      ) {
        if (!sameDrawing(before.drawn, marker.drawn)) {
          paintCursor(element, marker.drawn);
        }
        continue;
      }
      const made = this.layer.ownerDocument.createElement('div');
      made.className = marker.className;
      paintCursor(made, marker.drawn);
      if (element === undefined) {
        this.layer.append(made);
      } else {
        element.replaceWith(made);
      }
    }
    while (this.layer.children.length > markers.length) {
      this.layer.lastElementChild?.remove();
    }
    this.shown = markers;
  }
}

export function cursorLayer(look: CursorLook): Extension {
  return surfacePlugin((view) => new Cursors(view, look));
}
