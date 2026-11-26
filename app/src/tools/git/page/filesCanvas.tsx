import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { watchDevicePixels } from '../../../lib/page/devicePixels';
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
} from '../../../components/cells/page/runAtlas';
import type { RowsDrawn } from '../../../lib/page/virtualRows';
import { PathLooksContext } from '../../../lib/page/pathLooks';
import { rowParts } from './rowParts';
import { changeKind, changeMark } from '../../../lib/page/fileStatus';
import { twistyWidth } from './treeLayout';
import { filterRanges, type Filter } from '../../../lib/shared/filter';
import type { FindRange } from '../../../lib/shared/textMatches';
import { strings } from '../../../lib/shared/strings';
import { cssOf, over, packed, type Rgba } from './commitListLooks';
import { fadedOf } from './bubbleCanvas';
import { ellipsis, fitted } from './canvasText';
import { darkNow, watchScheme } from './colorScheme';
import {
  fileListLooksOf,
  type FileListLooks,
  type TextFont,
} from './fileListLooks';
import type { FileRowLook } from './fileRowLooks';
import { fileHitAt, type FileHit, type SeenFile } from './fileHits';

declare global {
  interface HTMLElement {
    seenFiles?: (() => readonly SeenFile[]) | undefined;
  }
}

interface Ink {
  readonly start: number;
  readonly end: number;
  readonly ink: string;
}

interface FileRecord {
  readonly sign: string;
  readonly rects: number[];
  readonly tiles: number[];
  readonly hit: FileHit;
  readonly seen: Omit<SeenFile, 'left' | 'top' | 'width' | 'height' | 'pinned'>;
}

const noMarks: readonly FindRange[] = [];

const signOf = (
  look: FileRowLook,
  hovering: boolean,
  top: number,
  parts: unknown,
) => JSON.stringify([look, hovering, top, parts]);

const strikeShare = 14;

let measuring: OffscreenCanvasRenderingContext2D | null | undefined;

function ascentOf(font: string): number {
  measuring ??= new OffscreenCanvas(1, 1).getContext('2d');
  if (measuring === null) {
    return 0;
  }
  measuring.font = font;
  return Math.round(measuring.measureText('x').fontBoundingBoxAscent);
}

interface Kept {
  readonly key: string;
  readonly filter: Filter;
  readonly rows: Map<string, FileRecord>;
}

function boundariesOf(
  length: number,
  inks: readonly Ink[],
  marks: readonly FindRange[],
): number[] {
  const cuts = new Set([0, length]);
  for (const { start, end } of [...inks, ...marks]) {
    cuts.add(Math.max(0, Math.min(length, start)));
    cuts.add(Math.max(0, Math.min(length, end)));
  }
  return [...cuts].toSorted((a, b) => a - b);
}

export function FilesCanvas({
  list,
  drawn,
  lookOf,
  filter,
  hits,
  line,
  active,
}: {
  list: React.RefObject<HTMLElement | null>;
  drawn: RowsDrawn;
  lookOf: (index: number) => FileRowLook | undefined;
  filter: Filter;
  hits: { current: readonly FileHit[] };
  line: number;
  active: boolean;
}) {
  const [scale, setScale] = useState(() => window.devicePixelRatio);
  useEffect(
    () => watchDevicePixels(() => setScale(window.devicePixelRatio)),
    [],
  );
  const host = useRef<HTMLDivElement>(null);
  const surface = useRef<CellSurface>(undefined);
  const atlas = useRef<RunAtlas>(undefined);
  const read = useRef<{ key: string; looks: FileListLooks }>(undefined);
  const kept = useRef<Kept>(undefined);
  const lastDrawn = useRef<
    | { surface: CellSurface; key: string; rows: readonly FileRecord[] }
    | undefined
  >(undefined);
  const hovered = useRef<number | undefined>(undefined);
  const scrolled = useRef<() => void>(() => {});
  const redraw = useRef<() => void>(() => {});
  const asked = useRef(new Set<string>());
  const generation = useSyncExternalStore(watchGpu, gpuGeneration);
  const dark = useSyncExternalStore(watchScheme, darkNow);
  const source = useContext(PathLooksContext);
  const fileColors = useSyncExternalStore(
    source.subscribe,
    source.fileColors,
    source.fileColors,
  );
  const known = useSyncExternalStore(
    source.subscribe,
    source.known,
    source.known,
  );

  useEffect(
    () => () => {
      surface.current?.dispose();
      atlas.current?.dispose();
      read.current?.looks.dispose();
      surface.current = undefined;
      atlas.current = undefined;
      read.current = undefined;
    },
    [],
  );

  useEffect(() => {
    const element = list.current;
    if (element === null) {
      return undefined;
    }
    const hover = (index: number | undefined) => {
      if (hovered.current !== index) {
        hovered.current = index;
        redraw.current();
      }
    };
    const moved = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      hover(
        fileHitAt(
          hits.current,
          event.clientX - box.left - element.clientLeft,
          event.clientY - box.top - element.clientTop,
        )?.row.index,
      );
    };
    const left = () => hover(undefined);
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

  useLayoutEffect(() => {
    const draw = () => {
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
        surface.current.canvas.className = 'files-canvas';
        element.append(surface.current.canvas);
        atlas.current = undefined;
      }
      if (atlas.current?.tileHeight !== tileHeight) {
        atlas.current?.dispose();
        atlas.current = new RunAtlas(device, tileHeight);
      }
      const runs = atlas.current;
      const cells = surface.current;
      const lookKey = [dark, scale, line, generation, active].join(' ');
      if (read.current?.key !== lookKey) {
        read.current?.looks.dispose();
        read.current = {
          key: lookKey,
          looks: fileListLooksOf(listed, scale),
        };
      }
      const { looks } = read.current;
      const spacer = (element.parentElement ?? listed).getBoundingClientRect();
      const view = listed.getBoundingClientRect();
      const width = spacer.width;
      const origin = view.top + listed.clientTop - spacer.top;
      const viewHeight = Math.min(listed.clientHeight, spacer.height);
      const rowsKey = [lookKey, width, runs.generation].join(' ');
      if (kept.current?.key !== rowsKey || kept.current.filter !== filter) {
        kept.current = { key: rowsKey, filter, rows: new Map() };
      }
      const cache = kept.current.rows;
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
      const fontOf = ({ family, size, weight }: TextFont) =>
        `${weight} ${size * fontScale}px ${family}`;
      const mono = fontOf(looks.mono);
      const twistyFont = fontOf(looks.proportional);
      const headerFont = fontOf(looks.header);
      const frame = cells.frame;
      frame.reset();
      cells.under.reset();
      const wanted = new Set<string>();
      const strikeSize = looks.mono.size * scale;
      const strikeThickness = Math.max(1, Math.round(strikeSize / strikeShare));
      const strikeRise = Math.round((ascentOf(mono) * looks.textScale) / 3);
      const strikeOf = (shift: number) => ({
        top: shift - strikeRise - strikeThickness,
        thickness: strikeThickness,
      });
      const dotHides = source.dotHides();

      const partsOf = (look: FileRowLook) =>
        look.kind === 'header'
          ? undefined
          : rowParts(look.name, look.kind === 'file', look.root, {
              known,
              fileColors,
              dotHides,
            });

      const recordRow = (
        index: number,
        look: FileRowLook,
        top: number,
        shownParts: ReturnType<typeof partsOf>,
      ): FileRecord => {
        const rects: number[] = [];
        const tiles: number[] = [];
        const topPixels = Math.round(top * scale);
        const heightPixels = Math.round((top + line) * scale) - topPixels;
        const ground: Rgba = look.selected
          ? over(looks.ground, looks.selected)
          : index === hovered.current
            ? over(looks.ground, looks.hover)
            : looks.ground;
        rects.push(0, topPixels, pixelWidth, heightPixels, packed(ground));
        const put = (
          run: string,
          font: string,
          x: number,
          baseline: number,
          inks: readonly Ink[],
          marks: readonly FindRange[] = noMarks,
          struck = false,
        ) => {
          const cuts = boundariesOf(run.length, inks, marks);
          const shift =
            Math.round((top + baseline) * scale) - Math.round(top * scale);
          for (let at = 0; at + 1 < cuts.length; at++) {
            const start = cuts[at] ?? 0;
            const end = cuts[at + 1] ?? start;
            if (end <= start) {
              continue;
            }
            const marked = marks.some(
              (mark) => mark.start <= start && mark.end >= end,
            );
            const ink = marked
              ? looks.markInk
              : (inks.find((each) => each.start <= start && each.end > start)
                  ?.ink ?? looks.ink);
            const pieceGround = marked ? looks.markGround : ground;
            const piece = run.slice(start, end);
            const from =
              x * scale +
              (start === 0 ? 0 : runs.measure(run.slice(0, start), font));
            if (marked) {
              const markLeft = Math.round(from);
              rects.push(
                markLeft,
                Math.round((top + looks.markTop) * scale),
                Math.round(from + runs.measure(piece, font)) - markLeft,
                Math.round((top + looks.markTop + looks.markHeight) * scale) -
                  Math.round((top + looks.markTop) * scale),
                packed(looks.markGround),
              );
            }
            const tile = runs.tile(
              piece,
              {
                key: `${font}|${ink}|${pieceGround.join(',')}|${shift}|${struck}`,
                font,
                ink,
                ground: cssOf(pieceGround),
                baseline: shift,
                ...(struck && { strike: strikeOf(shift) }),
              },
              offsetOf(from),
            );
            if (tile !== undefined) {
              tiles.push(
                Math.floor(from) - runPadding,
                topPixels,
                tile.u,
                tile.v,
                tile.width,
                packed(pieceGround),
              );
            }
          }
        };
        const rowInk = look.selected ? looks.selectedInk : looks.ink;
        const base = {
          index,
          key: look.key,
          kind: look.kind,
          selected: look.selected,
          open: look.kind === 'folder' ? look.open : undefined,
        };
        if (look.kind === 'header') {
          put(
            look.text,
            headerFont,
            looks.headerLeft,
            looks.proportionalBaseline,
            [{ start: 0, end: look.text.length, ink: rowInk }],
          );
          return {
            sign: '',
            rects,
            tiles,
            hit: {
              index,
              top,
              height: line,
              width,
              pinned: false,
              nameLeft: looks.headerLeft,
              mark: undefined,
              parts: [],
            },
            seen: {
              ...base,
              name: look.text,
              path: undefined,
              mark: undefined,
              dimmed: false,
              found: [],
              nameLeft: looks.headerLeft,
              parts: [],
            },
          };
        }
        const indent = look.depth * twistyWidth;
        const file = look.kind === 'file';
        const faded =
          (look.kind === 'folder' && look.dimmed) ||
          (look.kind === 'file' && look.change === undefined);
        const fade = (ink: string) =>
          faded ? fadedOf(ink, looks.mutedOpacity) : ink;
        let mark: FileHit['mark'];
        let markText: string | undefined;
        if (look.kind === 'file' && look.change !== undefined) {
          markText = changeMark(look.change);
          put(markText, mono, looks.markLeft, looks.monoBaseline, [
            {
              start: 0,
              end: markText.length,
              ink: looks.kinds.get(changeKind(look.change)) ?? rowInk,
            },
          ]);
          mark = {
            left: looks.markLeft,
            width: runs.measure(markText, mono) / scale,
          };
        }
        if (look.kind === 'folder') {
          const twisty = look.open
            ? strings.symbols.open
            : strings.symbols.closed;
          put(
            twisty,
            twistyFont,
            looks.twistyLeft + indent,
            looks.twistyBaseline,
            [{ start: 0, end: twisty.length, ink: fade(looks.twistyInk) }],
          );
        }
        const nameLeft =
          (file ? looks.fileNameLeft : looks.folderNameLeft) + indent;
        const parts = shownParts?.parts ?? [];
        const last = parts.at(-1);
        const lastColor = last?.color;
        const lastHidden = last?.hidden === true;
        const cutInk = fade(
          lastColor !== undefined || lastHidden
            ? looks.partInk(lastColor, lastHidden)
            : rowInk,
        );
        const room = width - nameLeft - looks.rightPadding;
        const shown = fitted(runs, look.name, mono, room * scale);
        const shownLength = shown.endsWith(ellipsis)
          ? shown.length - ellipsis.length
          : shown.length;
        const inks: Ink[] = [{ start: 0, end: shown.length, ink: cutInk }];
        const found = filterRanges(look.name, filter).flatMap((range) =>
          range.start < shownLength
            ? [{ start: range.start, end: Math.min(range.end, shownLength) }]
            : [],
        );
        const partHits: FileHit['parts'][number][] = [];
        for (const part of parts) {
          const { color, hidden } = part;
          const end = Math.min(part.at + part.name.length, shownLength);
          if (end <= part.at) {
            continue;
          }
          if (color !== undefined || hidden) {
            inks.unshift({
              start: part.at,
              end,
              ink: fade(
                looks.partInk(
                  color ?? (hidden ? lastColor : undefined),
                  hidden,
                ),
              ),
            });
          }
          partHits.push({
            text: part.name,
            left:
              nameLeft +
              (part.at === 0
                ? 0
                : runs.measure(shown.slice(0, part.at), mono)) /
                scale,
            width: runs.measure(shown.slice(part.at, end), mono) / scale,
            whole: part.whole,
            file: part.file,
          });
        }
        put(
          shown,
          mono,
          nameLeft,
          looks.monoBaseline,
          inks,
          found,
          look.kind === 'file' && look.change?.status === 'D',
        );
        return {
          sign: '',
          rects,
          tiles,
          hit: {
            index,
            top,
            height: line,
            width,
            pinned: false,
            nameLeft,
            mark,
            parts: partHits,
          },
          seen: {
            ...base,
            name: look.name,
            path: look.path,
            mark: markText,
            dimmed: faded,
            found: found.map((range) => shown.slice(range.start, range.end)),
            nameLeft,
            parts: partHits.map((part) => ({
              text: part.text,
              left: part.left,
              width: part.width,
              path: part.whole,
            })),
          },
        };
      };

      const placed = (
        index: number,
        top: number,
        keptRow: boolean,
      ): FileRecord | undefined => {
        const look = lookOf(index);
        if (look === undefined) {
          return undefined;
        }
        const shownParts = partsOf(look);
        if (shownParts?.unknown !== undefined) {
          wanted.add(shownParts.unknown);
        }
        const sign = signOf(
          look,
          index === hovered.current,
          top,
          shownParts?.parts.map((part) => [part.color, part.hidden]),
        );
        const cacheKey = `${keptRow ? 'row' : 'pinned'} ${index}`;
        const before = cache.get(cacheKey);
        if (before?.sign === sign) {
          return before;
        }
        const recorded = { ...recordRow(index, look, top, shownParts), sign };
        cache.set(cacheKey, recorded);
        return recorded;
      };

      const replay = (
        row: FileRecord,
        originPixels: number,
        into: typeof frame,
      ) => {
        const { rects, tiles } = row;
        for (let at = 0; at < rects.length; at += 5) {
          into.rect(
            rects[at] ?? 0,
            (rects[at + 1] ?? 0) - originPixels,
            rects[at + 2] ?? 0,
            rects[at + 3] ?? 0,
            rects[at + 4] ?? 0,
          );
        }
        for (let at = 0; at < tiles.length; at += 6) {
          into.tile(
            tiles[at] ?? 0,
            (tiles[at + 1] ?? 0) - originPixels,
            tiles[at + 2] ?? 0,
            tiles[at + 3] ?? 0,
            tiles[at + 4] ?? 0,
            tileHeight,
            tiles[at + 5] ?? 0,
          );
        }
      };

      const originPixels = Math.round(origin * scale);
      const rowHits: FileHit[] = [];
      const seen: SeenFile[] = [];
      const first = Math.max(0, Math.floor(origin / line));
      const lastRow = Math.min(
        drawn.count - 1,
        Math.floor((origin + viewHeight) / line),
      );
      const shown: { row: FileRecord; top: number; pinned: boolean }[] = [];
      for (let index = first; index <= lastRow; index++) {
        const place = drawn.placeOf(index);
        const row = place && placed(index, place.top, true);
        if (place !== undefined && row !== undefined) {
          shown.push({ row, top: place.top - origin, pinned: false });
        }
      }
      const pinned = drawn.count === 0 ? [] : drawn.pinnedAt(origin);
      pinned.forEach((index, at) => {
        const row = placed(index, at * line, false);
        if (row !== undefined) {
          shown.push({ row, top: at * line, pinned: true });
        }
      });
      const frameKey = [rowsKey, origin, viewHeight, pixelWidth].join(' ');
      const before = lastDrawn.current;
      if (
        before !== undefined &&
        before.surface === cells &&
        before.key === frameKey &&
        before.rows.length === shown.length &&
        before.rows.every((row, at) => row === shown[at]?.row)
      ) {
        return;
      }
      lastDrawn.current = {
        surface: cells,
        key: frameKey,
        rows: shown.map((each) => each.row),
      };
      for (const each of shown) {
        replay(
          each.row,
          each.pinned ? 0 : originPixels,
          each.pinned ? cells.under : frame,
        );
        rowHits.push({ ...each.row.hit, top: each.top, pinned: each.pinned });
        seen.push({
          ...each.row.seen,
          top: each.top,
          left: 0,
          width,
          height: line,
          pinned: each.pinned,
        });
      }
      if (pinned.length > 0) {
        const edge = Math.round(pinned.length * line * scale);
        const hairline = Math.max(1, Math.floor(scale + 1e-6));
        cells.under.rect(
          0,
          edge,
          pixelWidth,
          hairline,
          packed(over(looks.ground, looks.border)),
        );
        cells.clipped(0, edge + hairline);
      } else {
        cells.clipped(0, 0);
      }
      if (runs.full) {
        runs.reset();
        kept.current = undefined;
        draw();
        return;
      }
      runs.flush();
      cells.shaped([], 0);
      cells.draw();
      hits.current = rowHits;
      element.seenFiles = () => {
        const box = listed.getBoundingClientRect();
        const left = box.left + listed.clientLeft;
        const top = box.top + listed.clientTop;
        return seen.map((row) => ({
          ...row,
          left: left + row.left,
          top: top + row.top,
          nameLeft: left + row.nameLeft,
          parts: row.parts.map((part) => ({ ...part, left: left + part.left })),
        }));
      };
      if (wanted.size > 0) {
        queueMicrotask(() => {
          for (const path of wanted) {
            if (!asked.current.has(path)) {
              asked.current.add(path);
              source.ask(path);
            }
          }
        });
      }
    };
    redraw.current = draw;
    scrolled.current = draw;
    draw();
  });

  useEffect(() => {
    scrolled.current();
  }, []);

  return <div ref={host} className="files-layer" aria-hidden="true" />;
}
