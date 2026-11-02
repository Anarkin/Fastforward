import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ByteRange } from '../shared/protocol';
import { keyPressed } from '../../../ui/shortcuts';
import { wheeled } from '../../../shell/shared/keymap';
import { viewerKeymap } from '../shared/keymap';
import { followDrag } from '../../../ui/followDrag';
import {
  hideAfter,
  overlayScrollbarClass,
} from '../../../ui/overlayScrollbars';

export interface Thumb {
  readonly start: number;
  readonly length: number;
}

const minThumb = 24;

const minTick = 2;

const probeText = '0'.repeat(100);

const sidewaysColumns = 4;

const revealColumns = 8;

export interface RowText {
  readonly text: string;
  readonly from: number;
}

export function thumbBox(
  thumb: Thumb,
  track: number,
): { readonly top: number; readonly height: number } {
  const height = Math.min(track, Math.max(minThumb, thumb.length * track));
  return { top: thumb.start * (track - height), height };
}

export interface Tick {
  readonly top: number;
  readonly height: number;
}

export function matchTicks(
  matches: readonly ByteRange[],
  size: number,
  least: number,
): Tick[] {
  if (size <= 0) {
    return [];
  }
  const ticks: { top: number; bottom: number }[] = [];
  for (const match of matches) {
    const top = match.start / size;
    const bottom = Math.max(match.end / size, top + least);
    const last = ticks.at(-1);
    if (last !== undefined && top <= last.bottom) {
      last.bottom = Math.max(last.bottom, bottom);
    } else {
      ticks.push({ top, bottom });
    }
  }
  return ticks.map(({ top, bottom }) => ({ top, height: bottom - top }));
}

function percent(share: number): string {
  return `${share * 100}%`;
}

const MatchTicks = memo(function MatchTicks({
  matches,
  size,
  track,
}: {
  matches: readonly ByteRange[];
  size: number;
  track: number;
}) {
  const ticks = useMemo(
    () => matchTicks(matches, size, track > 0 ? minTick / track : 0),
    [matches, size, track],
  );
  return ticks.map((tick) => (
    <div
      key={tick.top}
      className="minimap-mark match"
      style={{ top: percent(tick.top), height: percent(tick.height) }}
    />
  ));
});

function charsBefore(row: Element, container: Node, offset: number): number {
  const before = document.createRange();
  before.selectNodeContents(row);
  before.setEnd(container, offset);
  return before.toString().length;
}

function copiedRows(
  selection: Selection | null,
  shown: Element | null,
  rowText: ((row: Element) => RowText | undefined) | undefined,
): string | undefined {
  if (selection === null || selection.rangeCount === 0 || shown === null) {
    return undefined;
  }
  const range = selection.getRangeAt(0);
  const rows = [...shown.children].filter((row) => range.intersectsNode(row));
  if (
    rows.length < 2 ||
    (rowText === undefined &&
      !rows.slice(0, -1).some((row) => row.hasAttribute('data-continues')))
  ) {
    return undefined;
  }
  return rows
    .map((row, index) => {
      const start = row.contains(range.startContainer)
        ? charsBefore(row, range.startContainer, range.startOffset)
        : undefined;
      const end = row.contains(range.endContainer)
        ? charsBefore(row, range.endContainer, range.endOffset)
        : undefined;
      const whole = rowText?.(row);
      const text =
        whole === undefined
          ? (row.textContent ?? '').slice(start ?? 0, end)
          : whole.text.slice(
              start === undefined ? 0 : whole.from + start,
              end === undefined ? undefined : whole.from + end,
            );
      const ends =
        index === rows.length - 1 || row.hasAttribute('data-continues')
          ? ''
          : '\n';
      return `${text}${ends}`;
    })
    .join('');
}

const noMatches: readonly ByteRange[] = [];

export function ScrollBody({
  thumb,
  onScreen,
  onColumns,
  move,
  jump,
  error,
  width,
  onSideways,
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
  move: (by: number) => void;
  jump: (share: number) => void;
  error: string | undefined;
  width?: number;
  onSideways?: (column: number) => void;
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
  const advance = useRef(1);
  const inset = useRef(0);
  const revealed = useRef(0);
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
  const [barShown, setBarShown] = useState(false);
  const [heldAt, setHeldAt] = useState<number>();
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

  useEffect(() => {
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
      setTrack(element.clientHeight);
      const style = getComputedStyle(row);
      const padding =
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      inset.current = parseFloat(style.paddingLeft) || 0;
      advance.current =
        (row.getBoundingClientRect().width - padding) / probeText.length || 1;
      onColumns?.(
        Math.max(
          1,
          Math.floor((element.clientWidth - padding) / advance.current),
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onScreen, onColumns]);

  const moved = (by: number) => {
    showBar();
    move(by);
  };
  const box = thumb && thumbBox(thumb, track);
  const dragging = heldAt !== undefined;

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
        wheel.current += event.deltaY;
        const height = probe.current?.getBoundingClientRect().height ?? 1;
        const rows = Math.trunc(wheel.current / height);
        if (rows !== 0) {
          wheel.current -= rows * height;
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
      <div className="viewer-row commander-viewer-probe" ref={probe}>
        {probeText}
      </div>
      {error === undefined ? (
        <div
          className="viewer-sideways"
          ref={sideways}
          onScroll={(event) =>
            onSideways?.(
              Math.floor(event.currentTarget.scrollLeft / advance.current),
            )
          }
        >
          <div
            className="viewer-rows"
            style={
              width === undefined
                ? undefined
                : {
                    minWidth: `calc(${width} * var(--commander-advance) + 16px + var(--scrollbar-size))`,
                  }
            }
          >
            {children}
          </div>
        </div>
      ) : (
        <div className="viewer-error">{error}</div>
      )}
      {box !== undefined && (
        <div
          className="viewer-scrollbar"
          onPointerDown={(event) => {
            event.preventDefault();
            const bar = event.currentTarget.getBoundingClientRect();
            const at = (clientY: number) => {
              const share =
                Math.min(Math.max(clientY - bar.top, 0), bar.height) /
                Math.max(1, bar.height);
              setHeldAt(share);
              jump(share);
            };
            at(event.clientY);
            followDrag(
              window,
              (pointer: PointerEvent) => at(pointer.clientY),
              () => {
                setHeldAt(undefined);
                showBar();
              },
            );
          }}
        >
          <MatchTicks matches={matches} size={size} track={track} />
          <div
            className={`${overlayScrollbarClass} viewer-thumb${barShown || dragging || barPinned ? ' shown' : ''}${dragging ? ' dragging' : ''}`}
            style={{
              top:
                heldAt === undefined ? box.top : heldAt * (track - box.height),
              height: box.height,
            }}
          />
        </div>
      )}
    </div>
  );
}
