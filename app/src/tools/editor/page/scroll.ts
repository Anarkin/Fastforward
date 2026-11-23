import {
  EditorView,
  ViewPlugin,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import { Prec, type Extension } from '@codemirror/state';
import {
  followRows,
  rowPadding,
  type RowFollower,
} from '../../../lib/page/rowScroll';
import type { ScrollSettings } from '../../../lib/page/scrollSettings';
import {
  followColumns,
  type ColumnFollower,
} from '../../../lib/page/columnScroll';
import { wheeled } from '../../../lib/shared/keymap';
import { editorKeymap } from './keymap';
import { cursorKeys } from './cursorKeys';
import {
  proxyElements,
  scrollProxy,
  type ScrollProxy,
  type Shown,
} from '../../../lib/page/scrollProxies';

class RowScrolling implements PluginValue {
  readonly following: RowFollower;
  private readonly across: ColumnFollower;
  private padded: number | undefined;
  private readonly sizes = {
    read: (view: EditorView): number =>
      rowPadding(
        view.scrollDOM.getBoundingClientRect().height,
        view.defaultLineHeight,
      ),
    write: (padding: number, view: EditorView) => {
      if (padding !== this.padded) {
        this.padded = padding;
        view.contentDOM.style.paddingBottom = `${padding}px`;
      }
    },
  };

  private readonly bar: ScrollProxy;
  private readonly barFrame: HTMLElement;
  private readonly acrossShown = {
    read: (view: EditorView) => {
      const scroller = view.scrollDOM;
      const gutter =
        parseFloat(getComputedStyle(view.contentDOM).marginLeft) || 0;
      const room = scroller.scrollWidth - scroller.clientWidth;
      return {
        gutter,
        shown:
          room > 0
            ? {
                at: scroller.scrollLeft / room,
                length:
                  (scroller.clientWidth - gutter) /
                  (scroller.scrollWidth - gutter),
              }
            : undefined,
      };
    },
    write: ({
      gutter,
      shown,
    }: {
      gutter: number;
      shown: Shown | undefined;
    }) => {
      this.barFrame.style.left = `${gutter}px`;
      this.bar.show(shown);
    },
  };
  private readonly onScroll = () => this.view.requestMeasure(this.acrossShown);
  private readonly resized: ResizeObserver;

  constructor(
    private readonly view: EditorView,
    scrolling: () => ScrollSettings,
  ) {
    const scroller = view.scrollDOM;
    this.following = followRows(scroller, () => view.defaultLineHeight, {
      limit: () => scroller.scrollHeight - scroller.clientHeight,
      perNotch: () => scrolling().wheelRows,
      smooth: () => scrolling().smooth,
      settles: () => scrolling().smoothSnap,
    });
    this.across = followColumns(scroller, {
      turned: (event) =>
        wheeled(editorKeymap.wheelSideways, event) !== undefined,
      advance: () => view.defaultCharacterWidth,
      perNotch: () => scrolling().wheelRows,
      smooth: () => scrolling().smooth,
      settles: () => scrolling().smoothSnap,
    });
    const { frame, element } = proxyElements('horizontal');
    this.barFrame = frame;
    view.dom.append(frame);
    this.bar = scrollProxy(
      element,
      'horizontal',
      {
        onDrag: (share) =>
          this.across.dragTo(
            share * (scroller.scrollWidth - scroller.clientWidth),
          ),
        onLetGo: () => this.across.dragEnd(),
        onStep: (steps) => this.across.stepBy?.(steps),
      },
      () => scroller,
    );
    scroller.addEventListener('scroll', this.onScroll, { passive: true });
    this.resized = new ResizeObserver(() => {
      view.requestMeasure(this.sizes);
      view.requestMeasure(this.acrossShown);
    });
    this.resized.observe(scroller);
    view.requestMeasure(this.sizes);
    view.requestMeasure(this.acrossShown);
  }

  update(update: ViewUpdate): void {
    if (update.geometryChanged) {
      update.view.requestMeasure(this.sizes);
      update.view.requestMeasure(this.acrossShown);
    }
  }

  destroy(): void {
    this.following.stop();
    this.across.stop();
    this.bar.stop();
    this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
    this.resized.disconnect();
    this.barFrame.remove();
  }
}

export function rowScrolling(scrolling: () => ScrollSettings): Extension {
  const rows = ViewPlugin.define((view) => new RowScrolling(view, scrolling));
  return [
    rows,
    EditorView.cursorScrollMargin.of({ x: 5, y: 0 }),
    Prec.high(
      EditorView.scrollHandler.of((view, _, { y }) => {
        if (y === 'nearest') {
          view.plugin(rows)?.following.reveals();
        }
        return false;
      }),
    ),
    cursorKeys((view) => view.plugin(rows)?.following),
  ];
}
