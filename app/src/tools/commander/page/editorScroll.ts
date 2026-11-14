import {
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import {
  followRows,
  rowPadding,
  type RowFollower,
  type ScrollSettings,
} from '../../../lib/page/rowScroll';

export interface Leading {
  readonly above: number;
  readonly below: number;
}

export function leadingOf(
  rowTop: number,
  rowHeight: number,
  text: { readonly top: number; readonly bottom: number },
): Leading {
  return {
    above: Math.max(0, text.top - rowTop),
    below: Math.max(0, rowTop + rowHeight - text.bottom),
  };
}

interface RowSizes {
  readonly padding: number;
  readonly leading: Leading | undefined;
}

function measuredLeading(view: EditorView): Leading | undefined {
  const walker = document.createTreeWalker(
    view.contentDOM,
    NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const line = node.parentElement?.closest('.cm-line');
    if (node.parentElement?.closest('.cell') === null && line) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const [rect] = range.getClientRects();
      if (rect !== undefined && rect.height > 0) {
        return leadingOf(
          line.getBoundingClientRect().top,
          view.defaultLineHeight,
          rect,
        );
      }
    }
  }
  return undefined;
}

class RowScrolling implements PluginValue {
  private readonly following: RowFollower;
  private padded: number | undefined;
  leading: Leading = { above: 0, below: 0 };
  private readonly sizes = {
    read: (view: EditorView): RowSizes => ({
      padding: rowPadding(view.scrollDOM.clientHeight, view.defaultLineHeight),
      leading: measuredLeading(view),
    }),
    write: ({ padding, leading }: RowSizes, view: EditorView) => {
      this.leading = leading ?? this.leading;
      if (padding !== this.padded) {
        this.padded = padding;
        view.contentDOM.style.paddingBottom = `${padding}px`;
      }
    },
  };

  constructor(view: EditorView, scrolling: () => ScrollSettings) {
    const scroller = view.scrollDOM;
    this.following = followRows(scroller, () => view.defaultLineHeight, {
      limit: () => scroller.scrollHeight - scroller.clientHeight,
      perNotch: () => scrolling().wheelRows,
      smooth: () => scrolling().smooth,
    });
    view.requestMeasure(this.sizes);
  }

  update(update: ViewUpdate): void {
    if (update.geometryChanged) {
      update.view.requestMeasure(this.sizes);
    }
  }

  destroy(): void {
    this.following.stop();
  }
}

export function rowScrolling(scrolling: () => ScrollSettings): Extension {
  const rows = ViewPlugin.define((view) => new RowScrolling(view, scrolling));
  return [
    rows,
    EditorView.scrollMargins.of((view) => {
      const { above, below } = view.plugin(rows)?.leading ?? {
        above: 0,
        below: 0,
      };
      return { top: above, bottom: below };
    }),
    EditorView.cursorScrollMargin.of({ x: 5, y: 0 }),
  ];
}
