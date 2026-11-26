import { useEffectEvent, useLayoutEffect, useRef } from 'react';
import { watchGpu } from '../../../components/cells/page/gpuDevice';
import { useCellTable } from '../../../lib/page/cellTable';
import { watchDevicePixels } from '../../../lib/page/devicePixels';
import { Words } from '../../../lib/page/name';
import { PathTitle } from '../../../lib/page/pathTitle';
import { keyPressed } from '../../../lib/page/shortcuts';
import { clicked, wheeled } from '../../../lib/shared/keymap';
import { useShell } from '../../../shell/page/store';
import { canvasKeymap } from './keymap';
import { dragged, wheelMove } from './pan';
import type { Origin, Point } from './pan';
import { Panner } from './panner';
import { boardShown, originShown } from './state';
import { useCanvas, useCanvasActions } from './store';
import { BoardSurface, probeRowClass, type Drawn } from './surface';

interface Panning {
  readonly pointer: number;
  readonly from: Point;
  readonly start: Origin;
}

export function BoardView() {
  const tab = useCanvas((state) => state.tab);
  const file = useCanvas((state) => state.file);
  const error = useCanvas((state) => boardShown(state)?.error);
  const board = useCanvas((state) => boardShown(state)?.board);
  const origin = useCanvas(originShown);
  const scrolling = useShell((state) => state.scrolling);
  const { pan, originOf } = useCanvasActions();
  const table = useCellTable();
  const body = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const surface = useRef<BoardSurface>(undefined);
  const drawn = useRef<Drawn>(undefined);
  const panning = useRef<Panning>(undefined);
  const panner = useRef<Panner>(undefined);
  const held = useRef(false);

  const panned = useEffectEvent((to: Origin) => {
    if (tab !== undefined) {
      pan(tab, to);
    }
  });

  const shown = useEffectEvent(
    (): Origin | undefined =>
      (tab === undefined ? undefined : originOf(tab)) ?? drawn.current?.origin,
  );

  const settings = useEffectEvent(() => scrolling);

  useLayoutEffect(() => {
    const made = new Panner({
      origin: shown,
      pan: panned,
      scrolling: settings,
    });
    panner.current = made;
    return () => {
      made.dispose();
      panner.current = undefined;
    };
  }, []);

  const redraw = useEffectEvent(() => {
    if (board !== undefined && table !== undefined) {
      drawn.current = surface.current?.draw(board, table, origin);
    }
  });

  useLayoutEffect(() => {
    const element = body.current;
    const hosting = host.current;
    const measuring = probe.current;
    if (element === null || hosting === null || measuring === null) {
      return undefined;
    }
    const made = new BoardSurface(hosting, element, measuring);
    surface.current = made;
    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(redraw);
    };
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change', draw);
    const unwatchGpu = watchGpu(draw);
    const unwatchPixels = watchDevicePixels(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scheme.removeEventListener('change', draw);
      unwatchGpu();
      unwatchPixels();
      made.dispose();
      surface.current = undefined;
    };
  }, []);

  useLayoutEffect(() => {
    if (board !== undefined && table !== undefined) {
      drawn.current = surface.current?.draw(board, table, origin);
    }
  }, [board, table, origin]);

  const onWheel = useEffectEvent((event: WheelEvent) => {
    const across = wheeled(canvasKeymap.panAcross, event) !== undefined;
    const known = drawn.current;
    if (
      tab === undefined ||
      known === undefined ||
      (!across && wheeled(canvasKeymap.pan, event) === undefined)
    ) {
      return;
    }
    event.preventDefault();
    const move = wheelMove(
      event,
      known.cell,
      known.view,
      scrolling.wheelRows,
      across,
    );
    if (move.notched) {
      panner.current?.glideBy(move.by);
    } else {
      panner.current?.holdBy(move.by);
    }
  });

  useLayoutEffect(() => {
    const element = body.current;
    if (element === null) {
      return undefined;
    }
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const known = drawn.current;
    const grabs =
      clicked(canvasKeymap.pan, event) !== undefined ||
      (held.current && clicked(canvasKeymap.panHeldDrag, event) !== undefined);
    if (known === undefined || !grabs) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add('panning');
    panning.current = {
      pointer: event.pointerId,
      from: { x: event.clientX, y: event.clientY },
      start: (tab === undefined ? undefined : originOf(tab)) ?? known.origin,
    };
  };

  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const moving = panning.current;
    const known = drawn.current;
    if (
      tab === undefined ||
      moving?.pointer !== event.pointerId ||
      known === undefined
    ) {
      return;
    }
    panner.current?.holdAt(
      dragged(
        moving.start,
        moving.from,
        { x: event.clientX, y: event.clientY },
        known.cell,
      ),
    );
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panning.current?.pointer !== event.pointerId) {
      return;
    }
    panning.current = undefined;
    event.currentTarget.classList.remove('panning');
    panner.current?.letGo();
  };

  const hold = (event: React.KeyboardEvent<HTMLDivElement>, down: boolean) => {
    if (keyPressed(canvasKeymap.panHeld, event.nativeEvent) === undefined) {
      return;
    }
    event.preventDefault();
    held.current = down;
    event.currentTarget.classList.toggle('pan-held', down);
  };

  return (
    <section className="column board">
      <div className="path-row">
        {file !== undefined && <PathTitle path={file} file />}
      </div>
      <div
        className="column-body board-body"
        ref={body}
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          startPan(event);
        }}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onLostPointerCapture={endPan}
        onKeyDown={(event) => hold(event, true)}
        onKeyUp={(event) => hold(event, false)}
        onBlur={(event) => {
          held.current = false;
          event.currentTarget.classList.remove('pan-held');
        }}
      >
        <div className="board-host" ref={host} />
        <div className={probeRowClass} ref={probe} aria-hidden="true" />
        {error !== undefined && (
          <div className="board-error">
            <Words>{error}</Words>
          </div>
        )}
      </div>
    </section>
  );
}
