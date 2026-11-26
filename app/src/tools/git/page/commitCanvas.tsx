import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { CellSurface } from '../../../components/cells/page/cellSurface';
import {
  gpuDevice,
  gpuGeneration,
  watchGpu,
} from '../../../components/cells/page/gpuDevice';
import {
  offsetOf,
  RunAtlas,
  runPadding,
  type RunStyle,
} from '../../../components/cells/page/runAtlas';
import type { Shape } from '../../../components/cells/page/shapeLayer';
import { type GraphRow } from '../shared/protocol';
import {
  bubbleFontOf,
  bobAt,
  bubbleLooksOf,
  paintBubble,
  type BubbleLooks,
} from './bubbleCanvas';
import { inLines } from './bubbleLines';
import { shapeKey } from './bubbleLooks';
import type { RowLook } from './commitLooks';
import { hitAt, type RowHit, type SeenCommit } from './commitHits';
import { laneMiddle } from './graphShapes';
import { graphShapes, type GraphRowPlace } from './graphShapes';
import {
  cssOf,
  looksOf,
  over,
  packed,
  type Looks,
  type Rgba,
} from './commitListLooks';
import { seenShapesOf, shapesOf, type SeenShape } from './graphSeen';
import {
  recordOf,
  replay,
  sameSign,
  type RecordedRow,
  type SeenText,
} from './commitRecords';
import type { FindRange } from '../../../lib/shared/textMatches';
import { ellipsis, fitted, piecesOf } from './canvasText';
import { darkNow, watchScheme } from './colorScheme';

export interface GraphPlace {
  readonly top: number;
  readonly height: number;
}

declare global {
  interface HTMLElement {
    seenCommits?: (() => readonly SeenCommit[]) | undefined;
    seenShapes?: (() => readonly SeenShape[]) | undefined;
    seenTexts?: (() => readonly SeenText[]) | undefined;
  }
}

const noMarks: readonly FindRange[] = [];

const rowPadding = 8;

const lineGap = 6;

const compareBar = 3;

const bubbleInset = 6;

const bubbleGap = 4;

const mergeReach = 8;

const layoutUnits = 64;

interface Drawn {
  readonly surface: CellSurface;
  readonly key: string;
  readonly indexes: readonly number[];
}

export function CommitCanvas({
  list,
  hits,
  bubbleProbe,
  shown,
  placeOf,
  graphOf,
  lookOf,
  indentOf,
  line,
  scale,
  active,
}: {
  list: React.RefObject<HTMLElement | null>;
  hits: { current: readonly RowHit[] };
  bubbleProbe: React.RefObject<HTMLElement | null>;
  shown: readonly number[];
  placeOf: (index: number) => GraphPlace | undefined;
  graphOf: (index: number) => GraphRow | undefined;
  lookOf: (index: number) => RowLook | undefined;
  indentOf: (index: number) => number;
  line: number;
  scale: number;
  active: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const surface = useRef<CellSurface>(undefined);
  const atlas = useRef<RunAtlas>(undefined);
  const drawn = useRef<Drawn>(undefined);
  const recorded = useRef<{
    key: string;
    rows: Map<number, RecordedRow>;
  }>(undefined);
  const read = useRef<{ key: string; looks: Looks }>(undefined);
  const readBubbles = useRef<{
    key: string;
    looks: BubbleLooks | undefined;
  }>(undefined);
  const hovered = useRef<number | undefined>(undefined);
  const hoveredAction = useRef<string | undefined>(undefined);
  const animation = useRef<number | undefined>(undefined);
  const scrolled = useRef<() => void>(() => {});
  const redraw = useRef<() => void>(() => {});
  const generation = useSyncExternalStore(watchGpu, gpuGeneration);
  const dark = useSyncExternalStore(watchScheme, darkNow);

  useEffect(
    () => () => {
      if (animation.current !== undefined) {
        cancelAnimationFrame(animation.current);
      }
      surface.current?.dispose();
      atlas.current?.dispose();
      surface.current = undefined;
      atlas.current = undefined;
    },
    [],
  );

  useEffect(() => {
    const element = list.current;
    if (element === null) {
      return undefined;
    }
    const hover = (index: number | undefined, action: string | undefined) => {
      if (hovered.current !== index || hoveredAction.current !== action) {
        hovered.current = index;
        hoveredAction.current = action;
        redraw.current();
      }
    };
    const moved = (event: PointerEvent) => {
      const spacer = host.current?.parentElement?.getBoundingClientRect();
      const hit =
        spacer === undefined
          ? undefined
          : hitAt(
              hits.current,
              event.clientX - spacer.left,
              event.clientY - spacer.top,
            );
      hover(
        hit?.row.index,
        hit?.kind === 'action'
          ? `${hit.row.bubbles.indexOf(hit.bubble)}:${hit.action.key}`
          : undefined,
      );
    };
    const left = () => hover(undefined, undefined);
    const onScroll = () => scrolled.current();
    element.addEventListener('scroll', onScroll);
    element.addEventListener('pointermove', moved);
    element.addEventListener('pointerleave', left);
    return () => {
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('pointermove', moved);
      element.removeEventListener('pointerleave', left);
    };
  }, [list, hits]);

  const signOf = (index: number): readonly unknown[] => {
    const place = placeOf(index);
    return [
      place?.top,
      place?.height,
      lookOf(index),
      indentOf(index),
      graphOf(index)?.merge === undefined,
      index === hovered.current,
      index === hovered.current ? hoveredAction.current : undefined,
    ];
  };

  useLayoutEffect(() => {
    const draw = (forced: boolean) => {
      const element = host.current;
      const listed = list.current;
      const device = gpuDevice();
      if (element === null || listed === null || device === undefined) {
        return;
      }
      const tileHeight = Math.round(line * scale);
      if (surface.current?.device !== device) {
        surface.current?.dispose();
        atlas.current?.dispose();
        surface.current = new CellSurface(device);
        surface.current.canvas.className = 'commit-canvas';
        element.append(surface.current.canvas);
        atlas.current = undefined;
      }
      if (atlas.current?.tileHeight !== tileHeight) {
        atlas.current?.dispose();
        atlas.current = new RunAtlas(device, tileHeight);
      }
      const runs = atlas.current;
      const cells = surface.current;
      const spacer = (element.parentElement ?? listed).getBoundingClientRect();
      const view = listed.getBoundingClientRect();
      const width = spacer.width;
      const origin = view.top + listed.clientTop - spacer.top;
      const viewHeight = listed.clientHeight;
      const end = origin + viewHeight;
      const lookKey = [dark, scale, line, generation, active].join(' ');
      if (read.current?.key !== lookKey) {
        read.current = { key: lookKey, looks: looksOf(listed, scale) };
      }
      const { looks } = read.current;
      const probe = bubbleProbe.current;
      const shapesKey =
        probe === null
          ? ''
          : [
              lookKey,
              ...Array.from(
                probe.querySelectorAll<HTMLElement>('[data-shape]'),
                (shape) => shape.dataset.shape,
              ),
            ].join('|');
      if (readBubbles.current?.key !== shapesKey) {
        readBubbles.current = {
          key: shapesKey,
          looks: probe === null ? undefined : bubbleLooksOf(probe),
        };
      }
      const bubbleLooks: BubbleLooks | undefined = readBubbles.current.looks;
      const rowsKey = [shapesKey, width, runs.generation].join(' ');
      if (recorded.current?.key !== rowsKey) {
        recorded.current = { key: rowsKey, rows: new Map() };
      }
      const cache = recorded.current.rows;
      const key = [rowsKey, origin, viewHeight].join(' ');
      const before = drawn.current;
      if (
        !forced &&
        before !== undefined &&
        before.surface === cells &&
        before.key === key &&
        before.indexes.every((index) =>
          sameSign(cache.get(index)?.sign, signOf(index)),
        )
      ) {
        return;
      }
      if (shown.length === 0) {
        element.style.display = 'none';
        drawn.current = undefined;
        return;
      }
      const lowest = Math.min(...shown);
      const highest = Math.max(...shown);
      const bottomOf = (index: number) => {
        const place = placeOf(index);
        return place === undefined ? -Infinity : place.top + place.height;
      };
      let first = lowest;
      while (first < highest && bottomOf(first) <= origin) {
        first++;
      }
      let last = highest;
      while (last > first && (placeOf(last)?.top ?? Infinity) >= end) {
        last--;
      }
      const hairline = Math.max(1, Math.floor(scale + 1e-6));
      const pixelWidth = Math.round(width * scale);
      const pixelHeight = Math.ceil(viewHeight * scale);
      element.style.display = '';
      element.style.width = `${pixelWidth / scale}px`;
      element.style.height = `${pixelHeight / scale}px`;
      element.style.marginBottom = `${-pixelHeight / scale}px`;
      cells.sized(pixelWidth, pixelHeight);
      cells.grounded(looks.ground);
      cells.texturedBy(runs.texture);
      runs.textScale = looks.textScale;
      const fontScale = scale / looks.textScale;
      const frame = cells.frame;
      frame.reset();
      cells.under.reset();
      const rows: GraphRowPlace[] = [];
      const indexes: number[] = [];
      const rowHits: RowHit[] = [];
      const seenTexts: SeenText[] = [];
      const seenBars: Shape[] = [];
      let record = recordOf([]);
      const originPixels = Math.round(origin * scale);
      const fontOf = (weight: string) =>
        `${weight} ${looks.size * fontScale}px ${looks.family}`;
      const styleOf = (
        font: string,
        ink: string,
        ground: Rgba,
        top: number,
      ): RunStyle => {
        const baseline =
          Math.round((top + looks.baseline) * scale) - Math.round(top * scale);
        return {
          key: `${font}|${ink}|${ground.join(',')}|${baseline}`,
          font,
          ink,
          ground: cssOf(ground),
          baseline,
        };
      };
      const text = (
        run: string,
        font: string,
        ink: string,
        x: number,
        top: number,
        ground: Rgba,
        marks: readonly FindRange[] = noMarks,
      ) => {
        if (run === '') {
          return;
        }
        const shownLength =
          run.endsWith(ellipsis) && marks.length > 0
            ? run.length - ellipsis.length
            : run.length;
        const pieces = piecesOf(run, marks, shownLength);
        const tileTop = Math.round(top * scale);
        for (const piece of pieces) {
          const from =
            x * scale +
            (piece.start === 0
              ? 0
              : runs.measure(run.slice(0, piece.start), font));
          const pieceGround = piece.marked ? looks.markGround : ground;
          if (piece.marked) {
            const markLeft = Math.round(from);
            record.rects.push(
              markLeft,
              Math.round((top + looks.markTop) * scale),
              Math.round(from + runs.measure(piece.text, font)) - markLeft,
              Math.round((top + looks.markTop + looks.markHeight) * scale) -
                Math.round((top + looks.markTop) * scale),
              packed(looks.markGround),
            );
          }
          const tile = runs.tile(
            piece.text,
            styleOf(font, piece.marked ? looks.markInk : ink, pieceGround, top),
            offsetOf(from),
          );
          if (tile !== undefined) {
            record.tiles.push(
              Math.floor(from) - runPadding,
              tileTop,
              tile.u,
              tile.v,
              tile.width,
              packed(pieceGround),
            );
          }
        }
        record.texts.push({ text: run, x, y: top });
      };
      const now = performance.now();
      const drawBubbles = (
        look: Extract<RowLook, { kind: 'commit' }>,
        rowTop: number,
        indent: number,
        room: number,
        ground: Rgba,
        hoveredHere: string | undefined,
      ) => {
        if (bubbleLooks === undefined) {
          return;
        }
        let counted = 0;
        const bubbleFont = bubbleFontOf(bubbleLooks, fontScale);
        const most = room + bubbleInset;
        const clipRight = Math.round((indent + room) * scale);
        const lines = look.lines ?? [look.bubbles.length];
        inLines(look.bubbles, lines).forEach((onLine, lineAt) => {
          const lineTop = rowTop + (2 + lineAt) * line;
          const top = lineTop + 1;
          const tileTop = Math.round(lineTop * scale);
          let left = indent - bubbleInset;
          for (const { look: bubble, checkedOut, running } of onLine) {
            const at = counted++;
            const geometry = bubbleLooks.geometries.get(shapeKey(bubble));
            if (geometry === undefined) {
              continue;
            }
            let shownText = bubble.text;
            let textWidth =
              Math.ceil(
                (runs.measure(shownText, bubbleFont) / scale) * layoutUnits,
              ) / layoutUnits;
            if (geometry.width + textWidth > most) {
              shownText = fitted(
                runs,
                bubble.text,
                bubbleFont,
                (most - geometry.width) * scale,
              );
              textWidth = most - geometry.width;
            }
            const bubbleWidth = geometry.width + textWidth;
            const tileLeft = Math.round(left * scale);
            const tileWidth =
              Math.min(Math.round((left + bubbleWidth) * scale), clipRight) -
              tileLeft;
            const painted = {
              look: bubble,
              checkedOut,
              text: shownText,
              textWidth,
              width: bubbleWidth,
              geometry,
              hovered: bubble.actions.find(
                (action) => hoveredHere === `${at}:${action.key}`,
              )?.key,
              running,
              bob: running.length > 0 ? bobAt(now, false) : 0,
            };
            record.animated ||= running.length > 0;
            const tile = runs.painted(
              JSON.stringify([
                'bubble',
                bubble,
                checkedOut,
                painted.hovered,
                running,
                painted.bob,
                shownText,
                tileWidth,
                offsetOf(left * scale),
                offsetOf(lineTop * scale),
                ground,
                scale,
              ]),
              tileWidth,
              cssOf(ground),
              (context) =>
                paintBubble(context, painted, bubbleLooks, {
                  textScale: looks.textScale,
                  left,
                  top,
                  tileLeft,
                  tileTop,
                  scale,
                  hairline,
                }),
            );
            if (tile !== undefined) {
              record.tiles.push(
                tileLeft,
                tileTop,
                tile.u,
                tile.v,
                tile.width,
                packed(ground),
              );
              record.texts.push({ text: shownText, x: left, y: lineTop });
            }
            const shift = bubbleWidth - geometry.width;
            record.bubbles.push({
              left,
              top,
              width: Math.min(bubbleWidth, clipRight / scale - left),
              height: geometry.height,
              bubble: { look: bubble, checkedOut, running },
              cut: shownText !== bubble.text,
              actions: bubble.actions.flatMap((action, place) => {
                const button = geometry.actionBoxes[place];
                return button === undefined
                  ? []
                  : [
                      {
                        key: action.key,
                        left: left + button.left + shift,
                        top: top + button.top,
                        width: button.width,
                        height: Math.min(button.height, geometry.height),
                      },
                    ];
              }),
            });
            left += bubbleWidth + bubbleGap;
          }
        });
      };
      const recordRow = (index: number, place: GraphPlace) => {
        const look = lookOf(index);
        const top = Math.round(place.top * scale);
        const height = Math.round(place.height * scale);
        const chosen =
          look !== undefined && look.kind !== 'placeholder' && look.selected;
        const ground = chosen
          ? looks.selected
          : index === hovered.current && look?.kind !== 'placeholder'
            ? over(looks.ground, looks.hover)
            : looks.ground;
        record.rects.push(0, top, pixelWidth, height, packed(ground));
        if (look === undefined) {
          return;
        }
        if (look.kind !== 'placeholder' && look.compareFrom) {
          record.rects.push(
            0,
            top,
            Math.round(compareBar * scale),
            height,
            packed(looks.focus),
          );
        }
        const indent = indentOf(index);
        const room = width - indent - rowPadding;
        const graphRow = graphOf(index);
        const merge =
          graphRow?.merge === undefined
            ? undefined
            : {
                left:
                  (laneMiddle(graphRow.lane, scale) - mergeReach * scale) /
                  scale,
                top: place.top + line / 2 - mergeReach,
                width: 2 * mergeReach,
                height: 2 * mergeReach,
              };
        const rowHit = (subject: string, font: string): RowHit => ({
          index,
          top: place.top,
          height: place.height,
          subjectLeft: indent,
          subjectWidth: runs.measure(subject, font) / scale,
          bubbles: record.bubbles,
          merge,
        });
        record.hit = rowHit('', fontOf(looks.weight));
        if (look.kind === 'placeholder') {
          const barHeight = 0.7 * looks.size * scale;
          for (const [onLine, share] of [
            [0, 0.7],
            [1, 0.35],
          ] as const) {
            record.bars.push({
              kind: 'rounded',
              x: indent * scale,
              y: top + (onLine * line + line / 2) * scale - barHeight / 2,
              width: room * share * scale,
              height: barHeight,
              radius: looks.barRadius * scale,
              fill: looks.bar,
            });
          }
          return;
        }
        if (look.kind === 'workingTree') {
          const font = fontOf(looks.weight);
          const ink = look.empty
            ? looks.emptyWorkingTree
            : looks.mutedWorkingTree;
          const shownText = fitted(runs, look.text, font, room * scale);
          text(shownText, font, ink, indent, place.top, ground);
          record.hit = rowHit(shownText, font);
          return;
        }
        const subjectFont = fontOf(look.checkedOut ? looks.bold : looks.weight);
        const subject = fitted(runs, look.subject, subjectFont, room * scale);
        text(
          subject,
          subjectFont,
          looks.ink,
          indent,
          place.top,
          ground,
          look.marks?.subject,
        );
        record.hit = rowHit(subject, subjectFont);
        const font = fontOf(looks.weight);
        const dateWidth = runs.measure(look.date, font) / scale;
        text(
          fitted(runs, look.author, font, (room - dateWidth - lineGap) * scale),
          font,
          looks.muted,
          indent,
          place.top + line,
          ground,
          look.marks?.author,
        );
        text(
          look.date,
          font,
          looks.muted,
          width - rowPadding - dateWidth,
          place.top + line,
          ground,
        );
        if (bubbleLooks !== undefined && look.bubbles.length > 0) {
          drawBubbles(
            look,
            place.top,
            indent,
            room,
            ground,
            index === hovered.current ? hoveredAction.current : undefined,
          );
        }
      };
      for (let index = first; index <= last; index++) {
        const place = placeOf(index);
        if (place === undefined) {
          continue;
        }
        indexes.push(index);
        const shownGraph = graphOf(index);
        if (shownGraph !== undefined) {
          rows.push({ row: shownGraph, top: place.top, height: place.height });
        }
        const sign = signOf(index);
        let row = cache.get(index);
        if (row === undefined || !sameSign(row.sign, sign)) {
          record = recordOf(sign);
          recordRow(index, place);
          row = record;
          if (row.animated) {
            cache.delete(index);
          } else {
            cache.set(index, row);
          }
        }
        replay(row, frame, originPixels, tileHeight, seenBars, seenTexts);
        if (row.hit !== undefined) {
          rowHits.push(row.hit);
        }
      }
      hits.current = rowHits;
      const shapes = graphShapes(rows, origin, line, scale);
      cells.shaped(
        [...seenBars, ...shapesOf(shapes, looks.lanes, scale)],
        originPixels,
      );
      if (runs.full) {
        runs.reset();
        drawn.current = undefined;
        draw(true);
        return;
      }
      runs.flush();
      cells.draw();
      if (
        indexes.some((index) => !cache.has(index)) &&
        animation.current === undefined
      ) {
        animation.current = requestAnimationFrame(() => {
          animation.current = undefined;
          redraw.current();
        });
      }
      drawn.current = { surface: cells, key, indexes };
      element.seenShapes = () => seenShapesOf(shapes, origin, scale);
      element.seenTexts = () => seenTexts;
      element.seenCommits = () => {
        const box = element.parentElement?.getBoundingClientRect();
        const left = box?.left ?? 0;
        const top = box?.top ?? 0;
        return rowHits.map((hit) => {
          const look = lookOf(hit.index);
          const told = look?.kind === 'placeholder' ? undefined : look;
          return {
            index: hit.index,
            kind: look?.kind,
            subject:
              told?.kind === 'commit'
                ? told.subject
                : told?.kind === 'workingTree'
                  ? told.text
                  : undefined,
            author: told?.kind === 'commit' ? told.author : undefined,
            date: told?.kind === 'commit' ? told.date : undefined,
            selected: told?.selected ?? false,
            compareFrom: told?.compareFrom ?? false,
            checkedOut: told?.kind === 'commit' && told.checkedOut,
            left,
            top: top + hit.top,
            width: box?.width ?? 0,
            height: hit.height,
            subjectLeft: left + hit.subjectLeft,
            line,
            bubbles: hit.bubbles.map((bubble) => ({
              text: bubble.bubble.look.text,
              kind: bubble.bubble.look.kind,
              checkedOut: bubble.bubble.checkedOut,
              left: left + bubble.left,
              top: top + bubble.top,
              width: bubble.width,
              height: bubble.height,
              actions: bubble.actions.map((action) => ({
                key: action.key,
                left: left + action.left,
                top: top + action.top,
                width: action.width,
                height: action.height,
              })),
            })),
          };
        });
      };
    };
    redraw.current = () => draw(true);
    scrolled.current = () => draw(false);
    draw(false);
  });

  return <div ref={host} className="graph-layer" aria-hidden="true" />;
}
