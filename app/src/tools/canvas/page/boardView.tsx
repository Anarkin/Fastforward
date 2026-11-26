import { useEffectEvent, useLayoutEffect, useRef } from 'react';
import { watchGpu } from '../../../components/cells/page/gpuDevice';
import { useCellTable, type CellTable } from '../../../lib/page/cellTable';
import { watchDevicePixels } from '../../../lib/page/devicePixels';
import { Words } from '../../../lib/page/name';
import { PathTitle } from '../../../lib/page/pathTitle';
import { keyPressed, useBinding } from '../../../lib/page/shortcuts';
import { clicked, wheeled } from '../../../lib/shared/keymap';
import { useShell } from '../../../shell/page/store';
import type { Board } from '../shared/board';
import { dragged, wheelMove, type Origin, type Point } from './pan';
import {
  dragging,
  pressed,
  released,
  type Gesture,
  type Preview,
} from './gestures';
import { hitOf, type Sides } from './hits';
import { canvasKeymap } from './keymap';
import { Panner } from './panner';
import { fileBox, ghostId, placedSizes, previewed } from './placing';
import type { Cell } from './routes';
import { boardShown, originShown, selectedShown, type Placing } from './state';
import { useCanvas, useCanvasActions } from './store';
import { BoardSurface, probeRowClass, type Drawn } from './surface';

interface Panning {
  readonly pointer: number;
  readonly from: Point;
  readonly start: Origin;
}

interface Pressing {
  readonly pointer: number;
  readonly gesture: Gesture;
}

interface Painted {
  readonly board: Board;
  readonly table: CellTable;
  readonly origin: Origin | undefined;
  readonly selected: readonly string[];
  readonly placing: Placing | undefined;
  readonly preview: Preview | undefined;
  readonly ghostAt: Cell | undefined;
  readonly unit: Drawn['unit'] | undefined;
}

const noBoxes = new Map();

function paint(
  surface: BoardSurface | undefined,
  { board, table, origin, selected, placing, preview, ghostAt, unit }: Painted,
): Drawn | undefined {
  const ghost =
    placing === undefined || ghostAt === undefined
      ? undefined
      : { type: placing, box: { ...ghostAt, ...placedSizes[placing] } };
  const shown =
    unit !== undefined && (preview !== undefined || ghost !== undefined)
      ? previewed(board, unit, preview?.boxes ?? noBoxes, ghost)
      : board;
  return surface?.draw(shown, table, origin, {
    selected: new Set(ghost === undefined ? selected : [...selected, ghostId]),
    marquee: preview?.area,
  });
}

function cellAt(
  event: { readonly clientX: number; readonly clientY: number },
  known: Drawn,
): Cell {
  return {
    column: Math.floor(
      known.origin.column + (event.clientX - known.left) / known.cell.width,
    ),
    row: Math.floor(
      known.origin.row + (event.clientY - known.top) / known.cell.height,
    ),
  };
}

function cursorOf(sides: Sides): string {
  if ((sides.left && sides.top) || (sides.right && sides.bottom)) {
    return 'nwse';
  }
  if ((sides.right && sides.top) || (sides.left && sides.bottom)) {
    return 'nesw';
  }
  return sides.left || sides.right ? 'ew' : 'ns';
}

export function BoardView() {
  const tab = useCanvas((state) => state.tab);
  const file = useCanvas((state) => state.file);
  const error = useCanvas((state) => boardShown(state)?.error);
  const board = useCanvas((state) => boardShown(state)?.board);
  const origin = useCanvas(originShown);
  const selected = useCanvas(selectedShown);
  const placing = useCanvas((state) => state.placing);
  const scrolling = useShell((state) => state.scrolling);
  const { pan, originOf, select, place, edit, undo, redo, save } =
    useCanvasActions();
  const table = useCellTable();
  const body = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const surface = useRef<BoardSurface>(undefined);
  const drawn = useRef<Drawn>(undefined);
  const panning = useRef<Panning>(undefined);
  const panner = useRef<Panner>(undefined);
  const pressing = useRef<Pressing>(undefined);
  const preview = useRef<Preview>(undefined);
  const ghostAt = useRef<Cell>(undefined);
  const lastAt = useRef<Cell>(undefined);
  const held = useRef(false);
  const paintedBoard = useRef<Board>(undefined);

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

  const repaint = () => {
    if (board !== undefined && table !== undefined) {
      drawn.current = paint(surface.current, {
        board,
        table,
        origin,
        selected,
        placing,
        preview: preview.current,
        ghostAt: ghostAt.current,
        unit: drawn.current?.unit,
      });
    }
  };

  const redraw = useEffectEvent(() => repaint());

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
    if (placing === undefined) {
      ghostAt.current = undefined;
    }
  }, [placing]);

  useLayoutEffect(() => {
    if (paintedBoard.current !== board) {
      paintedBoard.current = board;
      preview.current = undefined;
    }
    if (board !== undefined && table !== undefined) {
      drawn.current = paint(surface.current, {
        board,
        table,
        origin,
        selected,
        placing,
        preview: preview.current,
        ghostAt: ghostAt.current,
        unit: drawn.current?.unit,
      });
    }
  }, [board, table, origin, selected, placing]);

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

  const shownTab = tab !== undefined && board !== undefined;

  const startPlacing = (kind: Placing) => {
    const known = drawn.current;
    ghostAt.current =
      lastAt.current ??
      (known === undefined
        ? undefined
        : {
            column: Math.floor(
              known.origin.column + known.view.width / known.cell.width / 3,
            ),
            row: Math.floor(
              known.origin.row + known.view.height / known.cell.height / 3,
            ),
          });
    place(kind);
  };

  useBinding(canvasKeymap.placeText, () => startPlacing('text'), shownTab);
  useBinding(canvasKeymap.placeGroup, () => startPlacing('group'), shownTab);
  useBinding(
    canvasKeymap.delete,
    () => {
      if (tab !== undefined) {
        edit(tab, { kind: 'delete', nodes: selected, edges: [] });
      }
    },
    shownTab && selected.length > 0,
  );
  useBinding(
    canvasKeymap.selectAll,
    () => {
      if (tab !== undefined && board !== undefined) {
        select(
          tab,
          board.nodes.map((node) => node.id),
        );
      }
    },
    shownTab,
  );
  useBinding(
    canvasKeymap.leave,
    () => {
      if (placing !== undefined) {
        place(undefined);
      } else if (tab !== undefined) {
        select(tab, []);
      }
    },
    shownTab && (placing !== undefined || selected.length > 0),
  );
  useBinding(canvasKeymap.undo, () => tab !== undefined && undo(tab), shownTab);
  useBinding(canvasKeymap.redo, () => tab !== undefined && redo(tab), shownTab);
  useBinding(canvasKeymap.save, () => tab !== undefined && save(tab), shownTab);

  const startPan = (event: React.PointerEvent<HTMLDivElement>): boolean => {
    const known = drawn.current;
    const grabs =
      clicked(canvasKeymap.pan, event) !== undefined ||
      (held.current && clicked(canvasKeymap.panHeldDrag, event) !== undefined);
    if (known === undefined || !grabs) {
      return false;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add('panning');
    panning.current = {
      pointer: event.pointerId,
      from: { x: event.clientX, y: event.clientY },
      start: (tab === undefined ? undefined : originOf(tab)) ?? known.origin,
    };
    return true;
  };

  const press = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.focus({ preventScroll: true });
    if (startPan(event)) {
      return;
    }
    const known = drawn.current;
    const way = clicked(canvasKeymap.select, event);
    if (
      known === undefined ||
      tab === undefined ||
      board === undefined ||
      way === undefined
    ) {
      return;
    }
    const at = cellAt(event, known);
    if (placing !== undefined) {
      const { id: _id, ...box } = fileBox(
        ghostId,
        { ...at, ...placedSizes[placing] },
        known.unit,
      );
      edit(tab, { kind: 'add', node: { type: placing, ...box } });
      place(undefined);
      return;
    }
    const chosen = pressed(
      board,
      known.unit,
      hitOf(board, known.unit, at, new Set(selected)),
      at,
      selected,
      way,
    );
    select(tab, chosen.selected);
    if (chosen.gesture !== undefined) {
      event.currentTarget.setPointerCapture(event.pointerId);
      pressing.current = { pointer: event.pointerId, gesture: chosen.gesture };
    }
  };

  const movePan = (event: React.PointerEvent<HTMLDivElement>): boolean => {
    const moving = panning.current;
    const known = drawn.current;
    if (moving?.pointer !== event.pointerId || known === undefined) {
      return false;
    }
    panner.current?.holdAt(
      dragged(
        moving.start,
        moving.from,
        { x: event.clientX, y: event.clientY },
        known.cell,
      ),
    );
    return true;
  };

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (movePan(event)) {
      return;
    }
    const known = drawn.current;
    if (known === undefined || board === undefined || tab === undefined) {
      return;
    }
    const at = cellAt(event, known);
    lastAt.current = at;
    if (placing !== undefined) {
      ghostAt.current = at;
      repaint();
      return;
    }
    const going = pressing.current;
    if (going?.pointer === event.pointerId) {
      const shownNow = dragging(going.gesture, board, known.unit, at);
      preview.current = shownNow.preview;
      if (shownNow.selected !== undefined) {
        select(tab, shownNow.selected);
      }
      repaint();
      return;
    }
    const hit = hitOf(board, known.unit, at, new Set(selected));
    const cursor = hit.kind === 'handle' ? cursorOf(hit.sides) : '';
    if (event.currentTarget.dataset.cursor !== cursor) {
      event.currentTarget.dataset.cursor = cursor;
    }
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>): boolean => {
    if (panning.current?.pointer !== event.pointerId) {
      return false;
    }
    panning.current = undefined;
    event.currentTarget.classList.remove('panning');
    panner.current?.letGo();
    return true;
  };

  const letGo = (event: React.PointerEvent<HTMLDivElement>) => {
    if (endPan(event)) {
      return;
    }
    const going = pressing.current;
    const known = drawn.current;
    if (going?.pointer !== event.pointerId) {
      return;
    }
    pressing.current = undefined;
    const placed =
      known === undefined
        ? undefined
        : released(going.gesture, known.unit, cellAt(event, known));
    if (placed !== undefined && tab !== undefined) {
      edit(tab, placed);
      return;
    }
    preview.current = undefined;
    repaint();
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
        className={`column-body board-body ${placing === undefined ? '' : 'placing'}`}
        ref={body}
        tabIndex={0}
        onPointerDown={press}
        onPointerMove={move}
        onPointerUp={letGo}
        onPointerCancel={letGo}
        onLostPointerCapture={letGo}
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
