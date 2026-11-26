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
import { hitOf, type Hit, type Sides } from './hits';
import { canvasKeymap } from './keymap';
import { Panner } from './panner';
import { fileBox, ghostId, placedSizes, previewed } from './placing';
import type { Cell } from './routes';
import {
  boardShown,
  originShown,
  selectedShown,
  typingShown,
  type Placing,
  type Typing,
} from './state';
import { useCanvas, useCanvasActions } from './store';
import { BoardSurface, probeRowClass, type Drawn } from './surface';
import { offsetIn, typedLayout } from './typedLayout';
import { spanAt } from './nodeText';
import { useTypingContext } from './typingContext';
import { typingKeyed } from './typingKeys';
import { inserted, movedTo, selectedText } from './typing';
import { markAt } from './wiring';

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
  readonly typing: Typing | undefined;
  readonly hover: Cell | undefined;
  readonly whitespace: boolean;
}

const noBoxes = new Map();

function paint(
  surface: BoardSurface | undefined,
  {
    board,
    table,
    origin,
    selected,
    placing,
    preview,
    ghostAt,
    unit,
    typing,
    hover,
    whitespace,
  }: Painted,
): Drawn | undefined {
  const ghost =
    placing === undefined || ghostAt === undefined
      ? undefined
      : { type: placing, box: { ...ghostAt, ...placedSizes[placing] } };
  const wire = preview?.wire;
  const shown =
    unit !== undefined && (preview !== undefined || ghost !== undefined)
      ? previewed(board, unit, preview?.boxes ?? noBoxes, ghost, wire)
      : board;
  const mark =
    unit === undefined || hover === undefined
      ? undefined
      : markAt(board, unit, hover);
  return surface?.draw(shown, table, origin, {
    selected: new Set(
      ghost === undefined && wire === undefined
        ? selected
        : [...selected, ghostId],
    ),
    marquee: preview?.area,
    typing,
    whitespace,
    marks: mark === undefined ? [] : [mark.cell],
  });
}

const hoverFrom = (
  placing: Placing | undefined,
  typing: Typing | undefined,
  pressing: Pressing | undefined,
  at: Cell | undefined,
): Cell | undefined =>
  placing === undefined &&
  typing === undefined &&
  (pressing === undefined || pressing.gesture.kind === 'connect')
    ? at
    : undefined;

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
  const typing = useCanvas(typingShown);
  const scrolling = useShell((state) => state.scrolling);
  const whitespace = useShell((state) => state.textView.showWhitespace);
  const {
    pan,
    originOf,
    typingOf,
    select,
    place,
    edit,
    undo,
    redo,
    save,
    startTyping,
    typed,
    stopTyping,
  } = useCanvasActions();
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
  const markedAt = useRef<string>(undefined);
  const held = useRef(false);
  const choosing = useRef<number>(undefined);
  const paintedBoard = useRef<Board>(undefined);
  const placeContext = useTypingContext(body, typing, (caret) => {
    if (tab !== undefined) {
      typed(tab, caret);
    }
  });

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
    const element = body.current;
    if (board !== undefined && table !== undefined && element !== null) {
      drawn.current = paint(surface.current, {
        board,
        table,
        origin,
        selected,
        placing,
        preview: preview.current,
        ghostAt: ghostAt.current,
        unit: drawn.current?.unit,
        typing,
        hover: hoverFrom(placing, typing, pressing.current, lastAt.current),
        whitespace,
      });
      placeContext(drawn.current?.caret, element.getBoundingClientRect());
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
    const element = body.current;
    if (board !== undefined && table !== undefined && element !== null) {
      drawn.current = paint(surface.current, {
        board,
        table,
        origin,
        selected,
        placing,
        preview: preview.current,
        ghostAt: ghostAt.current,
        unit: drawn.current?.unit,
        typing,
        hover: hoverFrom(placing, typing, pressing.current, lastAt.current),
        whitespace,
      });
      placeContext(drawn.current?.caret, element.getBoundingClientRect());
    }
  }, [
    board,
    table,
    origin,
    selected,
    placing,
    typing,
    whitespace,
    placeContext,
  ]);

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
  const calm = shownTab && typing === undefined;
  const [only] = selected.length === 1 ? selected : [];
  const typeable =
    only !== undefined &&
    board?.nodes.find((node) => node.id === only)?.type === 'text';

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
        const edges = new Set(board?.edges.map((each) => each.id));
        edit(tab, {
          kind: 'delete',
          nodes: selected.filter((id) => !edges.has(id)),
          edges: selected.filter((id) => edges.has(id)),
        });
      }
    },
    calm && selected.length > 0,
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
    calm,
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
    calm && (placing !== undefined || selected.length > 0),
  );
  useBinding(
    canvasKeymap.typeIn,
    () => {
      if (tab !== undefined && only !== undefined) {
        startTyping(tab, only);
      }
    },
    calm && placing === undefined && typeable,
  );
  const settled = (then: (tab: string) => void) => {
    if (tab === undefined) {
      return;
    }
    stopTyping(tab);
    then(tab);
  };
  useBinding(canvasKeymap.undo, () => settled(undo), shownTab);
  useBinding(canvasKeymap.redo, () => settled(redo), shownTab);
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

  const hitAt = (on: Board, known: Drawn, at: Cell): Hit => {
    const mark = markAt(on, known.unit, at);
    if (mark !== undefined) {
      return { kind: 'mark', id: mark.id, side: mark.side };
    }
    const hit = hitOf(on, known.unit, at, new Set(selected));
    const edge = hit.kind === 'empty' ? known.edgeAt(at) : undefined;
    return edge === undefined ? hit : { kind: 'edge', id: edge };
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
    const hit = hitAt(board, known, at);
    const now = typingOf(tab);
    if (now !== undefined) {
      const caretWay = clicked(canvasKeymap.placeCaret, event);
      const layout = typedLayout(board, known.unit, known.widths, now);
      if (
        hit.kind === 'node' &&
        hit.id === now.id &&
        caretWay !== undefined &&
        layout !== undefined
      ) {
        typed(tab, movedTo(now, offsetIn(layout, at), caretWay === 'extend'));
        event.currentTarget.setPointerCapture(event.pointerId);
        choosing.current = event.pointerId;
        return;
      }
      if (hit.kind !== 'handle' || hit.id !== now.id) {
        stopTyping(tab);
      }
    }
    const chosen = pressed(board, known.unit, hit, at, selected, way);
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
    if (choosing.current === event.pointerId) {
      const now = typingOf(tab);
      const layout =
        now === undefined
          ? undefined
          : typedLayout(board, known.unit, known.widths, now);
      if (now !== undefined && layout !== undefined) {
        typed(tab, movedTo(now, offsetIn(layout, at), true));
      }
      return;
    }
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
    const mark = markAt(board, known.unit, at);
    const marked = mark === undefined ? undefined : `${mark.id}:${mark.side}`;
    if (marked !== markedAt.current) {
      markedAt.current = marked;
      repaint();
    }
    const hit = hitAt(board, known, at);
    const cursor =
      hit.kind === 'handle'
        ? cursorOf(hit.sides)
        : hit.kind === 'mark' && typing === undefined
          ? 'connect'
          : hit.kind === 'node' && hit.id === typing?.id
            ? 'text'
            : '';
    if (event.currentTarget.dataset.cursor !== cursor) {
      event.currentTarget.dataset.cursor = cursor;
    }
  };

  const left = () => {
    lastAt.current = undefined;
    if (markedAt.current !== undefined && pressing.current === undefined) {
      markedAt.current = undefined;
      repaint();
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
    if (choosing.current === event.pointerId) {
      choosing.current = undefined;
      return;
    }
    const going = pressing.current;
    const known = drawn.current;
    if (going?.pointer !== event.pointerId) {
      return;
    }
    pressing.current = undefined;
    const placed =
      known === undefined || board === undefined
        ? undefined
        : released(going.gesture, board, known.unit, cellAt(event, known));
    if (
      placed?.kind !== 'connect' &&
      placed !== undefined &&
      tab !== undefined
    ) {
      edit(tab, placed);
      return;
    }
    preview.current = undefined;
    repaint();
    if (placed !== undefined && tab !== undefined) {
      edit(tab, placed);
    }
  };

  const chosenWhole = (
    event: React.MouseEvent<HTMLDivElement>,
    whole: 'word' | 'line',
  ) => {
    const known = drawn.current;
    if (
      known === undefined ||
      tab === undefined ||
      board === undefined ||
      placing !== undefined ||
      clicked(canvasKeymap.select, event) !== 'one'
    ) {
      return;
    }
    const at = cellAt(event, known);
    const hit = hitAt(board, known, at);
    const node =
      hit.kind === 'node'
        ? board.nodes.find((each) => each.id === hit.id)
        : undefined;
    if (node?.type !== 'text') {
      return;
    }
    const now = typingOf(tab);
    const current = now?.id === node.id ? now : undefined;
    if (whole === 'line' && current === undefined) {
      return;
    }
    const text = current?.text ?? node.text;
    const layout = typedLayout(board, known.unit, known.widths, {
      id: node.id,
      text,
      head: current?.head ?? 0,
    });
    const span =
      layout === undefined
        ? undefined
        : spanAt(layout.rows, offsetIn(layout, at), whole);
    if (current === undefined) {
      startTyping(tab, node.id, span);
    } else if (span !== undefined) {
      typed(tab, { text, ...span });
    }
  };

  const keyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const now = tab === undefined ? undefined : typingOf(tab);
    const known = drawn.current;
    if (tab !== undefined && now !== undefined) {
      const layout =
        known === undefined || board === undefined
          ? undefined
          : typedLayout(board, known.unit, known.widths, now);
      const done = typingKeyed(event.nativeEvent, now, layout);
      if (done !== undefined) {
        event.preventDefault();
        if (done.kind === 'stop') {
          stopTyping(tab);
        } else {
          typed(tab, done.caret);
        }
        return;
      }
    }
    hold(event, true);
  };

  const copied = (
    event: React.ClipboardEvent<HTMLDivElement>,
    cut: boolean,
  ) => {
    const now = tab === undefined ? undefined : typingOf(tab);
    const text = now === undefined ? '' : selectedText(now);
    if (tab === undefined || now === undefined || text === '') {
      return;
    }
    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
    if (cut) {
      typed(tab, inserted(now, ''));
    }
  };

  const pasted = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const now = tab === undefined ? undefined : typingOf(tab);
    const text = event.clipboardData.getData('text/plain');
    if (tab === undefined || now === undefined || text === '') {
      return;
    }
    event.preventDefault();
    typed(tab, inserted(now, text));
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
        onPointerLeave={left}
        onMouseDown={(event) => {
          event.preventDefault();
          if (event.detail >= 3) {
            chosenWhole(event, 'line');
          }
        }}
        onDoubleClick={(event) => chosenWhole(event, 'word')}
        onKeyDown={keyDown}
        onCopy={(event) => copied(event, false)}
        onCut={(event) => copied(event, true)}
        onPaste={pasted}
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
