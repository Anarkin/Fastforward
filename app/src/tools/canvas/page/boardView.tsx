import { useEffectEvent, useLayoutEffect, useRef } from 'react';
import { watchGpu } from '../../../components/cells/page/gpuDevice';
import { useCellTable } from '../../../lib/page/cellTable';
import { watchDevicePixels } from '../../../lib/page/devicePixels';
import { Words } from '../../../lib/page/name';
import { PathTitle } from '../../../lib/page/pathTitle';
import { keyPressed } from '../../../lib/page/shortcuts';
import { clicked, wheeled } from '../../../lib/shared/keymap';
import { useShell, useShellActions } from '../../../shell/page/store';
import type { Board } from '../shared/board';
import { dragged, wheelMove, type Origin, type Point } from './pan';
import { dragging, pressed, released, type Preview } from './gestures';
import { showBoardMenu } from './boardMenu';
import { NodeColors } from './nodeColors';
import { hitOf, type Hit } from './hits';
import { canvasKeymap } from './keymap';
import { Panner } from './panner';
import { droppedSize, fileBox, ghostId, placedSizes } from './placing';
import type { Cell } from './routes';
import {
  boardShown,
  filesShown,
  originShown,
  zoomShown,
  selectedShown,
  typingShown,
  type Placing,
} from './state';
import { useCanvas, useCanvasActions } from './store';
import { BoardSurface, probeRowClass, type Drawn } from './surface';
import {
  cellAt,
  cursorOf,
  hoverFrom,
  paint,
  placedFrom,
  type Pressing,
} from './boardPaint';
import { offsetIn, typedLayout } from './typedLayout';
import { spanAt } from './nodeText';
import { grippedReach } from '../../../components/cells/page/textSelection';
import { useTypingSession } from './typingSession';
import { typingKeyed } from './typingKeys';
import { movedTo } from './typing';
import { endAt } from './edgeHandles';
import { markAt } from './wiring';
import { boxOf } from './grid';
import { useBoardClipboard } from './boardClipboard';
import { useBoardKeys } from './boardKeys';
import { typedTextOf, typesOneLine } from './typedTexts';
import { wheelZoom } from './zoom';
import { useSignTips } from './signTipping';

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
  const selected = useCanvas(selectedShown);
  const placing = useCanvas((state) => state.placing);
  const typing = useCanvas(typingShown);
  const titles = useCanvas((state) => state.titles);
  const files = useCanvas(filesShown);
  const zoomed = useCanvas(zoomShown);
  const scrolling = useShell((state) => state.scrolling);
  const whitespace = useShell((state) => state.textView.showWhitespace);
  const {
    pan,
    originOf,
    typingOf,
    select,
    place,
    edit,
    startTyping,
    typed,
    stopTyping,
    askColor,
    dropFiles,
    zoom,
  } = useCanvasActions();
  const { showMenu, openPathMenu, copyText } = useShellActions();
  const table = useCellTable();
  const body = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const unitProbe = useRef<HTMLDivElement>(null);
  const zoomRest = useRef(0);
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
  const gripped = useRef<{
    readonly first: number;
    readonly last: number;
    readonly whole: 'word' | 'line';
  }>(undefined);
  const paintedBoard = useRef<Board>(undefined);
  const colors = useRef<NodeColors>(undefined);
  const placeContext = useTypingSession(body, typing, (caret) => {
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
        colors: colors.current,
        titles,
        files,
        zoom: zoomed,
      });
      placeContext(
        board,
        drawn.current,
        typing,
        element.getBoundingClientRect(),
      );
    }
  };

  const redraw = useEffectEvent(() => repaint());

  useLayoutEffect(() => {
    const element = body.current;
    const hosting = host.current;
    const measuring = probe.current;
    const unitMeasuring = unitProbe.current;
    if (
      element === null ||
      hosting === null ||
      measuring === null ||
      unitMeasuring === null
    ) {
      return undefined;
    }
    const made = new BoardSurface(hosting, element, measuring, unitMeasuring);
    surface.current = made;
    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(redraw);
    };
    colors.current = new NodeColors(draw);
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
        colors: colors.current,
        titles,
        files,
        zoom: zoomed,
      });
      placeContext(
        board,
        drawn.current,
        typing,
        element.getBoundingClientRect(),
      );
      if (origin === undefined && drawn.current !== undefined) {
        panned(drawn.current.origin);
      }
    }
  }, [
    board,
    table,
    origin,
    selected,
    placing,
    typing,
    whitespace,
    titles,
    files,
    zoomed,
    placeContext,
  ]);

  const onWheel = useEffectEvent((event: WheelEvent) => {
    const across = wheeled(canvasKeymap.panAcross, event) !== undefined;
    const known = drawn.current;
    if (
      tab !== undefined &&
      known !== undefined &&
      wheeled(canvasKeymap.zoom, event) !== undefined
    ) {
      event.preventDefault();
      const rect = body.current?.getBoundingClientRect();
      const done = wheelZoom(zoomRest.current + event.deltaY, zoomed, known, {
        x: event.clientX - (rect?.left ?? 0),
        y: event.clientY - (rect?.top ?? 0),
      });
      zoomRest.current = done.rest;
      if (done.zoomed !== undefined) {
        panner.current?.holdAt(done.zoomed.origin);
        zoom(tab, done.zoomed.step);
      }
      return;
    }
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

  const startPlacing = (kind: Placing) => {
    ghostAt.current = placedFrom(drawn.current, lastAt.current);
    place(kind);
  };

  useBoardKeys(startPlacing);
  useSignTips(body, board, drawn);
  useBoardClipboard(body, drawn, lastAt);

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
    const end = endAt(on, known.unit, at, selected);
    if (end !== undefined) {
      return { kind: 'end', ...end };
    }
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
        (hit.kind === 'node' || hit.kind === 'edge') &&
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

  const dropped = (event: React.DragEvent<HTMLDivElement>) => {
    const known = drawn.current;
    const droppedFiles = [...event.dataTransfer.files];
    if (known === undefined || tab === undefined || droppedFiles.length === 0) {
      return;
    }
    event.preventDefault();
    const { id: _id, ...box } = fileBox(
      ghostId,
      { ...cellAt(event, known), ...droppedSize },
      known.unit,
    );
    dropFiles(tab, droppedFiles, box);
  };

  const openMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const known = drawn.current;
    if (known === undefined || tab === undefined || board === undefined) {
      return;
    }
    showBoardMenu(board, selected, hitAt(board, known, cellAt(event, known)), {
      at: { x: event.clientX, y: event.clientY },
      select: (ids) => select(tab, ids),
      show: showMenu,
      send: (change) => edit(tab, change),
      custom: (ids) => askColor(tab, ids),
      files,
      openPathMenu,
      copy: copyText,
    });
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
        const offset = offsetIn(layout, at);
        const grip = gripped.current;
        const span =
          grip === undefined
            ? undefined
            : spanAt(layout.rows, offset, grip.whole);
        if (grip === undefined || span === undefined) {
          typed(tab, movedTo(now, offset, true));
        } else {
          const { anchor, focus } = grippedReach(
            grip,
            {
              first: Math.min(span.anchor, span.head),
              last: Math.max(span.anchor, span.head),
            },
            (one, other) => one < other,
          );
          typed(tab, { text: now.text, anchor, head: focus });
        }
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
        : (hit.kind === 'mark' || hit.kind === 'end') && typing === undefined
          ? 'connect'
          : (hit.kind === 'node' || hit.kind === 'edge') &&
              hit.id === typing?.id
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
      gripped.current = undefined;
      return;
    }
    const going = pressing.current;
    const known = drawn.current;
    if (going?.pointer !== event.pointerId) {
      return;
    }
    pressing.current = undefined;
    const at = known === undefined ? undefined : cellAt(event, known);
    const stayed =
      at !== undefined &&
      at.column === going.gesture.from.column &&
      at.row === going.gesture.from.row;
    const edge =
      going.gesture.kind === 'connect' && stayed && at !== undefined
        ? known?.edgeAt(at)
        : undefined;
    if (edge !== undefined && tab !== undefined) {
      preview.current = undefined;
      select(tab, [edge]);
      return;
    }
    const placed =
      known === undefined || board === undefined || at === undefined
        ? undefined
        : released(going.gesture, board, known.unit, at);
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
    const onLabel =
      node?.type === 'group' && at.row === boxOf(node, known.unit).row;
    const id =
      hit.kind === 'edge'
        ? hit.id
        : (node !== undefined && node.type !== 'group') || onLabel
          ? node?.id
          : undefined;
    if (id === undefined) {
      return;
    }
    const now = typingOf(tab);
    const current = now?.id === id ? now : undefined;
    if (whole === 'line' && current === undefined) {
      return;
    }
    const text = current?.text ?? typedTextOf(board, id) ?? '';
    const layout = typedLayout(board, known.unit, known.widths, {
      id,
      text,
      head: current?.head ?? 0,
    });
    const onText =
      layout !== undefined &&
      (hit.kind !== 'edge' ||
        (at.row === layout.area.row &&
          at.column >= layout.area.column &&
          at.column < layout.area.column + layout.area.room));
    const span = onText
      ? spanAt(layout.rows, offsetIn(layout, at), whole)
      : undefined;
    if (current === undefined) {
      startTyping(tab, id, span);
    } else if (span !== undefined) {
      typed(tab, { text, ...span });
      gripped.current =
        choosing.current === undefined
          ? undefined
          : {
              first: Math.min(span.anchor, span.head),
              last: Math.max(span.anchor, span.head),
              whole,
            };
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
      const done = typingKeyed(
        event.nativeEvent,
        now,
        layout,
        typesOneLine(board, now.id),
      );
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
      <div className={probeRowClass} ref={unitProbe} aria-hidden="true" />
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
          } else if (event.detail === 2) {
            chosenWhole(event, 'word');
          }
        }}
        onContextMenu={openMenu}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={dropped}
        onKeyDown={keyDown}
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
