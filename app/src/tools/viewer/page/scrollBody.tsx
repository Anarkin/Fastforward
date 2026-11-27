import type { Sentence } from '../../../lib/shared/sentences';
import { Words } from '../../../lib/page/name';
import { fontOf, spacingOf } from '../../../lib/page/textWidths';
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ByteRange } from '../shared/protocol';
import { keyPressed } from '../../../lib/page/shortcuts';
import { wheeled } from '../../../lib/shared/keymap';
import { viewerKeymap } from './keymap';
import { sidewaysColumns } from '../../../lib/page/scrollSettings';
import { notchesOf, wheelTurn } from '../../../lib/page/wheelTurns';
import { glideRowsOf, type RowGlider } from './rowGlide';
import {
  followColumns,
  type ColumnFollower,
} from '../../../lib/page/columnScroll';
import { useShell } from '../../../shell/page/store';
import { wrapColumns } from '../../../lib/page/wordWrap';
import { boxColumns } from '../../../lib/page/wrapBox';
import { type Ends, type Thumb } from './scrollThumbs';
import { MatchTicks } from './scrollbar';
import { ScrollProxy } from '../../../lib/page/scrollProxy';
import { setWheeled } from '../../../lib/page/scrollbarLinks';

const probeText = '0'.repeat(1000);

const revealColumns = 8;

const noMatches: readonly ByteRange[] = [];

const leadRoom = 64;

const leadRest = 150;

declare module 'react' {
  interface CSSProperties {
    readonly '--viewer-lead'?: number;
  }
}

export function ScrollBody({
  thumb,
  ends,
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
  jumps = 0,
  matches = noMatches,
  currentMatch,
  size = 0,
  lead = 0,
  children,
}: {
  thumb: Thumb | undefined;
  ends: Ends;
  onScreen: (screen: number) => void;
  onColumns?: (columns: number) => void;
  onFont?: (char: number, font: string, spacing: number) => void;
  move: (by: number) => void;
  jump: (share: number, part?: (fraction: number) => void) => void;
  error: Sentence | undefined;
  width?: number;
  wrapped?: boolean;
  numbered?: boolean;
  onSideways?: (column: number) => void;
  keptLeft?: number;
  settled?: boolean;
  onLeft?: (left: number) => void;
  reveal?: { readonly column: number; readonly asked: number };
  jumps?: number;
  matches?: readonly ByteRange[];
  currentMatch?: ByteRange | undefined;
  size?: number;
  lead?: number;
  children: React.ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const sideways = useRef<HTMLDivElement>(null);
  const rowsBox = useRef<HTMLDivElement>(null);
  const scrollbar = useRef<HTMLDivElement>(null);
  const advance = useRef(1);
  const revealed = useRef(0);
  const leftBack = useRef(keptLeft);
  const leftSeen = useRef(0);
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
    const x = reveal.column * advance.current;
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
  const gliding = useShell((state) => state.scrolling.smooth);
  const perNotch = useEffectEvent(() => wheelRows);
  const smooth = useEffectEvent(() => gliding);
  const snaps = useShell((state) => state.scrolling.smoothSnap);
  const settles = useEffectEvent(() => snaps);
  useEffect(() => body.current?.focus(), []);
  const failed = error !== undefined;
  const glider = useRef<RowGlider>(undefined);
  const edges = useRef(ends);
  useLayoutEffect(() => {
    edges.current = ends;
  });
  const moveBy = useEffectEvent((by: number) => move(by));
  const partNow = useRef(0);
  const rowHeight = useRef(0);
  const [leadFrom, setLeadFrom] = useState(lead - leadRoom);
  const since = lead - leadFrom;
  const led = since >= 0 && since <= 2 * leadRoom ? since : leadRoom;
  const placeRows = useEffectEvent((strayed = false) => {
    const area = sideways.current;
    const top = (led + partNow.current) * rowHeight.current;
    if (
      area !== null &&
      rowHeight.current > 0 &&
      (!strayed || Math.abs(area.scrollTop - top) > 1)
    ) {
      area.scrollTop = top;
    }
  });
  const resting = useRef<ReturnType<typeof setTimeout>>(undefined);
  const restLead = useEffectEvent(() => {
    if (partNow.current === 0 && since !== leadRoom) {
      setLeadFrom(lead - leadRoom);
    }
  });
  const settleLead = useEffectEvent(() => {
    clearTimeout(resting.current);
    if (led !== since) {
      setLeadFrom(lead - leadRoom);
    } else if (partNow.current === 0 && since !== leadRoom) {
      resting.current = setTimeout(restLead, leadRest);
    }
  });
  useLayoutEffect(() => {
    clearTimeout(resting.current);
    if (led !== since) {
      setLeadFrom(lead - leadRoom);
    } else if (partNow.current === 0 && since !== leadRoom) {
      resting.current = setTimeout(restLead, leadRest);
    }
    placeRows();
  }, [lead, led, since]);
  useEffect(() => () => clearTimeout(resting.current), []);
  useEffect(() => {
    if (jumps > 0) {
      glider.current?.reset();
    }
  }, [jumps]);
  useEffect(() => {
    const made = glideRowsOf({
      move: (by) => moveBy(by),
      shift: (part) => {
        partNow.current = part;
        placeRows();
        settleLead();
      },
      atStart: () => edges.current.atStart,
      atEnd: () => edges.current.atEnd,
      settles,
    });
    glider.current = made;
    return () => {
      made.stop();
      glider.current = undefined;
    };
  }, []);
  useEffect(() => {
    const area = sideways.current;
    if (area === null || failed) {
      return undefined;
    }
    const keep = () => placeRows(true);
    area.addEventListener('scroll', keep, { passive: true });
    return () => area.removeEventListener('scroll', keep);
  }, [failed]);
  const across = useRef<ColumnFollower>(undefined);
  useEffect(() => {
    const element = sideways.current;
    if (element === null || failed) {
      return undefined;
    }
    const following = followColumns(element, {
      turned: (event) =>
        wheeled(viewerKeymap.wheelSideways, event) !== undefined,
      advance: () => advance.current,
      perNotch,
      smooth,
      settles,
    });
    across.current = following;
    return () => {
      following.stop();
      across.current = undefined;
    };
  }, [failed]);

  useLayoutEffect(() => {
    const element = body.current;
    const row = probe.current;
    if (!element || !row) {
      return undefined;
    }
    const measure = () => {
      const measured = row.getBoundingClientRect().height;
      const height = measured || 1;
      rowHeight.current = measured;
      placeRows();
      const shown = sideways.current?.clientHeight ?? element.clientHeight;
      const rows = Math.max(1, Math.floor(shown / height));
      setScreen(rows);
      onScreen(rows);
      setTrack(
        scrollbar.current?.getBoundingClientRect().height ??
          element.clientHeight,
      );
      const style = getComputedStyle(row);
      const padding =
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
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
    if (sideways.current !== null) {
      observer.observe(sideways.current);
    }
    return () => observer.disconnect();
  }, [onScreen, onColumns, onFont, wrapped]);

  const moved = (by: number) => {
    if (gliding && glider.current) {
      glider.current.glideBy(by);
    } else {
      move(by);
    }
  };
  const jumped = (share: number, held = false) => {
    const gliders = glider.current;
    if (held && gliding && gliders) {
      gliders.hold();
      jump(share, gliders.holdAt);
    } else {
      gliders?.reset();
      jump(share);
    }
  };

  const turned = (event: WheelEvent) => {
    if (
      event.defaultPrevented ||
      wheeled(viewerKeymap.wheelSideways, event) !== undefined
    ) {
      return;
    }
    const height = probe.current?.getBoundingClientRect().height || 1;
    if (
      gliding &&
      glider.current &&
      notchesOf(event) === undefined &&
      event.deltaMode === 0
    ) {
      glider.current.holdBy(event.deltaY / height);
      return;
    }
    const { rows, pending } = wheelTurn(wheel.current, event, {
      row: height,
      step: height,
      page: body.current?.clientHeight ?? 0,
      perNotch: wheelRows,
    });
    wheel.current = pending;
    if (rows !== 0) {
      moved(rows);
    }
  };
  const turnedOver = useEffectEvent((event: WheelEvent) => {
    turned(event);
    event.preventDefault();
  });
  useEffect(() => {
    const element = body.current;
    if (element === null) {
      return undefined;
    }
    setWheeled(element, 'rows', turnedOver);
    return () => setWheeled(element, 'rows', undefined);
  }, []);

  return (
    <div
      className={`column-body viewer-body${wrapped ? ' wrapped' : ''}${numbered ? ' numbered' : ''}`}
      ref={body}
      tabIndex={0}
      data-column-focus=""
      onWheel={(event) => turned(event.nativeEvent)}
      onKeyDown={(event) => {
        const sidestep = keyPressed(viewerKeymap.scrollSideways, event);
        if (sidestep !== undefined) {
          event.preventDefault();
          if (sideways.current) {
            across.current?.scrollTo(
              sideways.current.scrollLeft +
                sidestep * sidewaysColumns * advance.current,
              true,
            );
          }
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
            jumped(0);
            return;
          case 'last':
            jumped(1);
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
      {error === undefined && (
        <div className={`viewer-gutter${numbered ? ' numbered' : ''}`} />
      )}
      {error === undefined ? (
        <div
          className="viewer-sideways"
          ref={sideways}
          onScroll={(event) => {
            const { scrollLeft } = event.currentTarget;
            if (scrollLeft === leftSeen.current) {
              return;
            }
            leftSeen.current = scrollLeft;
            onSideways?.(Math.floor(scrollLeft / advance.current));
            if (leftBack.current === 0) {
              onLeft?.(scrollLeft);
            }
          }}
        >
          <div
            className={`viewer-rows${wrapped ? ' wrapped' : ''}${numbered ? ' numbered' : ''}`}
            ref={rowsBox}
            style={{
              '--viewer-lead': led,
              ...(width !== undefined && {
                minWidth: `calc(${width} * var(--text-advance) + 8px)`,
              }),
            }}
          >
            {children}
          </div>
        </div>
      ) : (
        <div className="viewer-error">
          <Words>{error}</Words>
        </div>
      )}
      <ScrollProxy
        axis="vertical"
        shown={thumb && { at: thumb.start, length: thumb.length }}
        onDrag={(share) => jumped(share, true)}
        onLetGo={() => glider.current?.letGo()}
        onStep={moved}
      >
        <MatchTicks
          ticks={scrollbar}
          matches={matches}
          current={currentMatch}
          size={size}
          track={track}
        />
      </ScrollProxy>
    </div>
  );
}
