import type { Extension } from '@codemirror/state';
import {
  surfacePlugin,
  type EditorSurface,
  type SurfacePart,
  type SurfaceUpdate,
} from './surface';
import {
  leastOn,
  matchMarks,
  type MatchMark,
  type Span,
} from '../../../lib/page/scrollbarTicks';
import { paintMarks } from '../../../lib/page/trackMarks';
import { currentFound, foundOf, type Found } from './find';

function linesOf(view: EditorSurface, found: readonly Found[]): Span[] {
  const spans: Span[] = [];
  let lineEnd = -1;
  for (const { from } of found) {
    if (from > lineEnd) {
      const block = view.lineBlockAt(from);
      lineEnd = block.to;
      spans.push({ top: block.top, bottom: block.top + block.height });
    }
  }
  return spans;
}

class FindTicks implements SurfacePart {
  private readonly box = document.createElement('div');
  private drawn = '';
  private readonly measure = {
    read: (view: EditorSurface): MatchMark[] => {
      const found = foundOf(view.state);
      if (found.length === 0) {
        return [];
      }
      const total = view.scrollDOM.scrollHeight;
      const track = this.box.clientHeight;
      const current = currentFound(view.state);
      return matchMarks(
        linesOf(view, found),
        current === undefined ? undefined : linesOf(view, [current])[0],
        total,
        leastOn(track),
      );
    },
    write: (ticks: MatchMark[]) => {
      const drawing = ticks
        .map(({ kind, top, height }) => `${kind}${top}:${height}`)
        .join();
      if (drawing === this.drawn) {
        return;
      }
      this.drawn = drawing;
      paintMarks(this.box, ticks);
    },
  };

  constructor(private readonly view: EditorSurface) {
    this.box.className = 'scrollbar-marks';
    view.dom.append(this.box);
    view.requestMeasure(this.measure);
  }

  update(update: SurfaceUpdate): void {
    if (
      foundOf(update.state) !== foundOf(update.startState) ||
      update.selectionSet ||
      update.heightChanged ||
      update.geometryChanged
    ) {
      update.view.requestMeasure(this.measure);
    }
  }

  destroy(): void {
    this.box.remove();
  }
}

export const findTicks: Extension = surfacePlugin(
  (view) => new FindTicks(view),
);
