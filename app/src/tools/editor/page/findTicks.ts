import type { Extension } from '@codemirror/state';
import {
  surfacePlugin,
  type EditorSurface,
  type SurfacePart,
  type SurfaceUpdate,
} from './surface';
import {
  leastTick,
  tickJoiner,
  type Tick,
} from '../../../lib/page/scrollbarTicks';
import { foundOf, type Found } from './find';

export interface Span {
  readonly top: number;
  readonly bottom: number;
}

export function ticksOf(
  spans: readonly Span[],
  total: number,
  track: number,
): Tick[] {
  if (total <= 0) {
    return [];
  }
  const joiner = tickJoiner(track > 0 ? leastTick / track : 0);
  for (const { top, bottom } of spans) {
    joiner.add(top / total, bottom / total);
  }
  return joiner.ticks();
}

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

const percent = (share: number) => `${share * 100}%`;

class FindTicks implements SurfacePart {
  private readonly box = document.createElement('div');
  private drawn = '';
  private readonly measure = {
    read: (view: EditorSurface): Tick[] => {
      const found = foundOf(view.state);
      return found.length === 0
        ? []
        : ticksOf(
            linesOf(view, found),
            view.scrollDOM.scrollHeight,
            this.box.clientHeight,
          );
    },
    write: (ticks: Tick[]) => {
      const drawing = ticks.map(({ top, height }) => `${top}:${height}`).join();
      if (drawing === this.drawn) {
        return;
      }
      this.drawn = drawing;
      this.box.replaceChildren(
        ...ticks.map(({ top, height }) => {
          const mark = document.createElement('div');
          mark.className = 'scrollbar-mark match';
          mark.style.setProperty('--mark-top', percent(top));
          mark.style.setProperty('--mark-height', percent(height));
          return mark;
        }),
      );
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
