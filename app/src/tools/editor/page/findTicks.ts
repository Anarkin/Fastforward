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
import { currentFound, foundOf, type Found } from './find';

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

export function currentTickOf(
  span: Span | undefined,
  total: number,
  track: number,
): Tick | undefined {
  return span === undefined || total <= 0
    ? undefined
    : {
        top: span.top / total,
        height: Math.max(
          (span.bottom - span.top) / total,
          track > 0 ? leastTick / track : 0,
        ),
      };
}

interface Marked extends Tick {
  readonly kind: 'match' | 'current';
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
    read: (view: EditorSurface): Marked[] => {
      const found = foundOf(view.state);
      if (found.length === 0) {
        return [];
      }
      const total = view.scrollDOM.scrollHeight;
      const track = this.box.clientHeight;
      const current = currentFound(view.state);
      const shown = currentTickOf(
        current === undefined ? undefined : linesOf(view, [current])[0],
        total,
        track,
      );
      return [
        ...ticksOf(linesOf(view, found), total, track).map((tick) => ({
          kind: 'match' as const,
          ...tick,
        })),
        ...(shown === undefined
          ? []
          : [{ kind: 'current' as const, ...shown }]),
      ];
    },
    write: (ticks: Marked[]) => {
      const drawing = ticks
        .map(({ kind, top, height }) => `${kind}${top}:${height}`)
        .join();
      if (drawing === this.drawn) {
        return;
      }
      this.drawn = drawing;
      this.box.replaceChildren(
        ...ticks.map(({ kind, top, height }) => {
          const mark = document.createElement('div');
          mark.className = `scrollbar-mark ${kind}`;
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
