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
} from '../../../lib/page/rowScroll';
import type { ScrollSettings } from '../../../lib/page/scrollSettings';
import { followColumns } from '../../../lib/page/columnScroll';
import { wheeled } from '../../../lib/shared/keymap';
import { editorKeymap } from './keymap';

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

export function wholeRows(height: number, row: number): number {
  return row > 0 ? Math.max(row, Math.round(height / row) * row) : height;
}

function roundGaps(view: EditorView): void {
  const row = view.defaultLineHeight;
  for (const gap of view.contentDOM.querySelectorAll('.cm-line > div')) {
    if (
      gap instanceof HTMLElement &&
      gap.style.width === '' &&
      gap.style.height.endsWith('px')
    ) {
      const height = parseFloat(gap.style.height);
      const whole = wholeRows(height, row);
      if (whole !== height) {
        gap.style.height = `${whole}px`;
      }
    }
  }
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
  private readonly across: () => void;
  private padded: number | undefined;
  leading: Leading = { above: 0, below: 0 };
  private readonly sizes = {
    read: (view: EditorView): RowSizes => ({
      padding: rowPadding(
        view.scrollDOM.getBoundingClientRect().height,
        view.defaultLineHeight,
      ),
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
  private readonly gaps = {
    read: () => undefined,
    write: (_: undefined, view: EditorView) => roundGaps(view),
  };

  constructor(view: EditorView, scrolling: () => ScrollSettings) {
    const scroller = view.scrollDOM;
    this.following = followRows(scroller, () => view.defaultLineHeight, {
      limit: () => scroller.scrollHeight - scroller.clientHeight,
      perNotch: () => scrolling().wheelRows,
      smooth: () => scrolling().smooth,
    });
    this.across = followColumns(scroller, {
      turned: (event) =>
        wheeled(editorKeymap.wheelSideways, event) !== undefined,
      advance: () => view.defaultCharacterWidth,
      perNotch: () => scrolling().wheelRows,
      smooth: () => scrolling().smooth,
    });
    view.requestMeasure(this.sizes);
    view.requestMeasure(this.gaps);
  }

  update(update: ViewUpdate): void {
    if (update.geometryChanged) {
      update.view.requestMeasure(this.sizes);
    }
  }

  docViewUpdate(view: EditorView): void {
    roundGaps(view);
  }

  destroy(): void {
    this.following.stop();
    this.across();
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
