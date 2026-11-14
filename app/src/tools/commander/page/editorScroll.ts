import {
  ViewPlugin,
  type EditorView,
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

class RowScrolling implements PluginValue {
  private readonly following: RowFollower;
  private padded: number | undefined;
  private readonly padding = {
    read: (view: EditorView) =>
      rowPadding(view.scrollDOM.clientHeight, view.defaultLineHeight),
    write: (padding: number, view: EditorView) => {
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
    view.requestMeasure(this.padding);
  }

  update(update: ViewUpdate): void {
    if (update.geometryChanged) {
      update.view.requestMeasure(this.padding);
    }
  }

  destroy(): void {
    this.following.stop();
  }
}

export function rowScrolling(scrolling: () => ScrollSettings): Extension {
  return ViewPlugin.define((view) => new RowScrolling(view, scrolling));
}
