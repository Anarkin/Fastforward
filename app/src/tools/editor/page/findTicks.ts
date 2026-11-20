import type { Extension } from '@codemirror/state';
import {
  ViewPlugin,
  type EditorView,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
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

function linesOf(view: EditorView, found: readonly Found[]): Span[] {
  const above = view.documentPadding.top;
  const spans: Span[] = [];
  let lineEnd = -1;
  for (const { from } of found) {
    if (from > lineEnd) {
      const block = view.lineBlockAt(from);
      lineEnd = block.to;
      spans.push({
        top: above + block.top,
        bottom: above + block.top + block.height,
      });
    }
  }
  return spans;
}

const percent = (share: number) => `${share * 100}%`;

class FindTicks implements PluginValue {
  private readonly box = document.createElement('div');
  private drawn = '';
  private readonly measure = {
    read: (view: EditorView): Tick[] => {
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
          mark.style.top = percent(top);
          mark.style.height = percent(height);
          return mark;
        }),
      );
    },
  };

  constructor(private readonly view: EditorView) {
    this.box.className = 'scrollbar-marks';
    view.dom.append(this.box);
    view.requestMeasure(this.measure);
  }

  update(update: ViewUpdate): void {
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

export const findTicks: Extension = ViewPlugin.fromClass(FindTicks);
