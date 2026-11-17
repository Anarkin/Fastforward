import type { Sentence } from '../../../lib/shared/sentences';
import { Words } from '../../../lib/page/name';
import { fontOf, spacingOf } from '../../../lib/page/textWidths';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ByteRange } from '../shared/protocol';
import { keyPressed } from '../../../lib/page/shortcuts';
import { wheeled } from '../../../lib/shared/keymap';
import { viewerKeymap } from './keymap';
import { sidewaysColumns } from '../../../lib/page/scrollSettings';
import { wheelTurn } from '../../../lib/page/wheelTurns';
import { useShell } from '../../../shell/page/store';
import { hideAfter } from '../../../lib/page/scrollbarGeometry';
import { wrapColumns } from '../../../lib/page/wordWrap';
import { boxColumns } from '../../../lib/page/wrapBox';
import { type Thumb } from './scrollThumbs';
import { copiedRows, type RowText } from './rowCopy';
import { ViewerScrollbar } from './scrollbar';

const probeText = '0'.repeat(1000);

const revealColumns = 8;

const noMatches: readonly ByteRange[] = [];

export function ScrollBody({
  thumb,
  onScreen,
  onColumns,
  onFont,
  move,
  jump,
  error,
  width,
  wrapped = false,
  numbered = false,
  onSideways,
  keptLeft = 0,
  settled = false,
  onLeft,
  reveal,
  rowText,
  barPinned = false,
  matches = noMatches,
  size = 0,
  children,
}: {
  thumb: Thumb | undefined;
  onScreen: (screen: number) => void;
  onColumns?: (columns: number) => void;
  onFont?: (char: number, font: string, spacing: number) => void;
  move: (by: number) => void;
  jump: (share: number) => void;
  error: Sentence | undefined;
  width?: number;
  wrapped?: boolean;
  numbered?: boolean;
  onSideways?: (column: number) => void;
  keptLeft?: number;
  settled?: boolean;
  onLeft?: (left: number) => void;
  reveal?: { readonly column: number; readonly asked: number };
  rowText?: (row: Element) => RowText | undefined;
  barPinned?: boolean;
  matches?: readonly ByteRange[];
  size?: number;
  children: React.ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const sideways = useRef<HTMLDivElement>(null);
  const rowsBox = useRef<HTMLDivElement>(null);
  const scrollbar = useRef<HTMLDivElement>(null);
  const advance = useRef(1);
  const inset = useRef(0);
  const revealed = useRef(0);
  const leftBack = useRef(keptLeft);
  useLayoutEffect(() => {
    const area = sideways.current;
    if (area === null || leftBack.current === 0) {
      return;
    }
    if (wrapped) {
      leftBack.current = 0;
    } else if (area.scrollWidth - area.clientWidth >= leftBack.current - 1) {
      area.scrollLeft = leftBack.current;
      leftBack.current = 0;
    } else if (settled) {
      leftBack.current = 0;
    }
  });
  useLayoutEffect(() => {
    const area = sideways.current;
    if (
      area === null ||
      reveal === undefined ||
      reveal.asked === revealed.current
    ) {
      return;
    }
    const x = inset.current + reveal.column * advance.current;
    const margin = revealColumns * advance.current;
    if (
      x < area.scrollLeft + margin ||
      x > area.scrollLeft + area.clientWidth - margin * 2
    ) {
      area.scrollLeft = Math.max(0, x - margin);
    }
    if (
      x >= area.scrollLeft &&
      x + advance.current <= area.scrollLeft + area.clientWidth
    ) {
      revealed.current = reveal.asked;
    }
  });
  const [track, setTrack] = useState(0);
  const [screen, setScreen] = useState(1);
  const wheel = useRef(0);
  const wheelRows = useShell((state) => state.scrolling.wheelRows);
  const [barShown, setBarShown] = useState(false);
  const hiding = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showBar = useCallback(() => {
    clearTimeout(hiding.current);
    setBarShown(true);
    hiding.current = setTimeout(() => setBarShown(false), hideAfter);
  }, []);
  useEffect(() => () => clearTimeout(hiding.current), []);
  useEffect(() => body.current?.focus(), []);
  useEffect(() => {
    const element = body.current;
    if (element === null) {
      return undefined;
    }
    const onWheel = (event: WheelEvent) => {
      if (wheeled(viewerKeymap.wheelSideways, event) === undefined) {
        return;
      }
      event.preventDefault();
      sideways.current?.scrollBy({ left: event.deltaX || event.deltaY });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  useLayoutEffect(() => {
    const element = body.current;
    const row = probe.current;
    if (!element || !row) {
      return undefined;
    }
    const measure = () => {
      const height = row.getBoundingClientRect().height || 1;
      const rows = Math.max(1, Math.floor(element.clientHeight / height));
      setScreen(rows);
      onScreen(rows);
      setTrack(
        scrollbar.current?.getBoundingClientRect().height ??
          element.clientHeight,
      );
      const style = getComputedStyle(row);
      const padding =
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      inset.current = parseFloat(style.paddingLeft) || 0;
      const char =
        (row.getBoundingClientRect().width - padding) / probeText.length;
      advance.current = char || 1;
      onFont?.(advance.current, fontOf(row), spacingOf(row));
      const wrappedRows = rowsBox.current;
      onColumns?.(
        wrapped && wrappedRows !== null
          ? boxColumns(wrappedRows, char)
          : wrapColumns(element.clientWidth - padding, char),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onScreen, onColumns, onFont, wrapped]);

  const moved = (by: number) => {
    showBar();
    move(by);
  };

  return (
    <div
      className="column-body viewer-body"
      ref={body}
      tabIndex={0}
      data-column-focus=""
      onPointerMove={showBar}
      onCopy={(event) => {
        const copied = copiedRows(
          getSelection(),
          event.currentTarget.querySelector('.viewer-rows'),
          rowText,
        );
        if (copied !== undefined) {
          event.preventDefault();
          event.clipboardData.setData('text/plain', copied);
        }
      }}
      onWheel={(event) => {
        if (wheeled(viewerKeymap.wheelSideways, event) !== undefined) {
          return;
        }
        const height = probe.current?.getBoundingClientRect().height || 1;
        const { rows, pending } = wheelTurn(wheel.current, event.nativeEvent, {
          row: height,
          step: height,
          page: event.currentTarget.clientHeight,
          perNotch: wheelRows,
        });
        wheel.current = pending;
        if (rows !== 0) {
          moved(rows);
        }
      }}
      onKeyDown={(event) => {
        const across = keyPressed(viewerKeymap.scrollSideways, event);
        if (across !== undefined) {
          event.preventDefault();
          sideways.current?.scrollBy({
            left: across * sidewaysColumns * advance.current,
          });
          return;
        }
        const step = keyPressed(viewerKeymap.scroll, event);
        if (step === undefined) {
          return;
        }
        event.preventDefault();
        switch (step) {
          case 'up':
            moved(-1);
            return;
          case 'down':
            moved(1);
            return;
          case 'pageUp':
            moved(-Math.max(1, screen - 1));
            return;
          case 'pageDown':
            moved(Math.max(1, screen - 1));
            return;
          case 'first':
            jump(0);
            return;
          case 'last':
            jump(1);
            return;
          default:
            step satisfies never;
        }
      }}
    >
      <div
        className={`viewer-row viewer-probe${numbered ? ' numbered' : ''}`}
        ref={probe}
      >
        {probeText}
      </div>
      {error === undefined ? (
        <div
          className="viewer-sideways"
          ref={sideways}
          onScroll={(event) => {
            const { scrollLeft } = event.currentTarget;
            onSideways?.(Math.floor(scrollLeft / advance.current));
            if (leftBack.current === 0) {
              onLeft?.(scrollLeft);
            }
          }}
        >
          <div
            className={`viewer-rows${wrapped ? ' wrapped' : ''}${numbered ? ' numbered' : ''}`}
            ref={rowsBox}
            style={
              width === undefined
                ? undefined
                : {
                    minWidth: `calc(${width} * var(--text-advance) + var(--viewer-inset) + 8px + var(--scrollbar-size))`,
                  }
            }
          >
            {children}
          </div>
        </div>
      ) : (
        <div className="viewer-error">
          <Words>{error}</Words>
        </div>
      )}
      <ViewerScrollbar
        scrollbar={scrollbar}
        thumb={thumb}
        track={track}
        shown={barShown || barPinned}
        onShow={showBar}
        jump={jump}
        matches={matches}
        size={size}
      />
    </div>
  );
}
