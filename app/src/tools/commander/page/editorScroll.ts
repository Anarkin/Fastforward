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

interface RowSizes {
  readonly padding: number;
  readonly leading: number | undefined;
}

function textHeight(view: EditorView): number | undefined {
  const walker = document.createTreeWalker(
    view.contentDOM,
    NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.parentElement?.closest('.cell') === null) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const [rect] = range.getClientRects();
      if (rect !== undefined && rect.height > 0) {
        return rect.height;
      }
    }
  }
  return undefined;
}

class RowScrolling implements PluginValue {
  private readonly following: RowFollower;
  private padded: number | undefined;
  leading = 0;
  private readonly sizes = {
    read: (view: EditorView): RowSizes => {
      const text = textHeight(view);
      return {
        padding: rowPadding(
          view.scrollDOM.clientHeight,
          view.defaultLineHeight,
        ),
        leading:
          text === undefined
            ? undefined
            : Math.max(0, (view.defaultLineHeight - text) / 2),
      };
    },
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
      const leading = view.plugin(rows)?.leading ?? 0;
      return { top: leading, bottom: leading };
    }),
    EditorView.cursorScrollMargin.of({ x: 5, y: 0 }),
  ];
}
