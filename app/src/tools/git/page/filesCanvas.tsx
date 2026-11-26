import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { watchDevicePixels } from '../../../lib/page/devicePixels';
import {
  gpuGeneration,
  watchGpu,
} from '../../../components/cells/page/gpuDevice';
import {
  ListCanvas,
  type RowRecord,
  type ShownRow,
} from '../../../components/cells/page/listCanvas';
import {
  ascentOf,
  ellipsis,
  fitted,
  putRun,
  type Ink,
  type Range,
  type RowPaint,
} from '../../../components/cells/page/runText';
import type { RowsDrawn } from '../../../lib/page/virtualRows';
import { PathLooksContext } from '../../../lib/page/pathLooks';
import { rowParts } from './rowParts';
import { changeKind, changeMark } from '../../../lib/page/fileStatus';
import { twistyWidth } from './treeLayout';
import { filterRanges, type Filter } from '../../../lib/shared/filter';
import { strings } from '../../../lib/shared/strings';
import { over, packed, type Rgba } from './commitListLooks';
import { fadedOf } from '../../../components/cells/page/listLooks';
import { darkNow, watchScheme } from '../../../lib/page/colorScheme';
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

interface FileRecord extends RowRecord {
  readonly hit: FileHit;
  readonly seen: Omit<SeenFile, 'left' | 'top' | 'width' | 'height' | 'pinned'>;
}

const noMarks: readonly Range[] = [];

const signOf = (
  look: FileRowLook,
  hovering: boolean,
  top: number,
  parts: unknown,
) => JSON.stringify([look, hovering, top, parts]);

const strikeShare = 14;

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
  const kept = useRef<ListCanvas<FileRecord>>(undefined);
  const read = useRef<{ key: string; looks: FileListLooks }>(undefined);
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
      kept.current?.dispose();
      kept.current = undefined;
      read.current?.looks.dispose();
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
      if (element === null || listed === null) {
        return;
      }
      kept.current ??= new ListCanvas<FileRecord>('files-canvas');
      const canvas = kept.current;
      const view = canvas.viewOf(
        element,
        listed,
        scale,
        Math.round(line * scale),
      );
      if (view === undefined) {
        return;
      }
      const { cells, runs, width, origin, viewHeight, pixelWidth } = view;
      const lookKey = [dark, scale, line, generation, active].join(' ');
      if (read.current?.key !== lookKey) {
        read.current?.looks.dispose();
        read.current = {
          key: lookKey,
          looks: fileListLooksOf(listed, scale),
        };
      }
      const { looks } = read.current;
      const cache = canvas.rowsFor([lookKey, width].join(' '), filter);
      cells.grounded(looks.ground);
      runs.textScale = looks.textScale;
      const fontScale = scale / looks.textScale;
      const fontOf = ({ family, size, weight }: TextFont) =>
        `${weight} ${size * fontScale}px ${family}`;
      const mono = fontOf(looks.mono);
      const twistyFont = fontOf(looks.proportional);
      const headerFont = fontOf(looks.header);
      const wanted = new Set<string>();
      const strikeSize = looks.mono.size * scale;
      const strikeThickness = Math.max(1, Math.round(strikeSize / strikeShare));
      const strikeRise = Math.round((ascentOf(mono) * looks.textScale) / 3);
      const strike = { rise: strikeRise, thickness: strikeThickness };
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
        const paint: RowPaint = { rects, tiles };
        const runLook = { ...looks, ground };
        const put = (
          text: string,
          font: string,
          x: number,
          baseline: number,
          inks: readonly Ink[],
          marks: readonly Range[] = noMarks,
          struck = false,
        ) =>
          putRun(paint, runs, scale, top, runLook, {
            text,
            font,
            x,
            baseline,
            inks,
            marks,
            ...(struck && { strike }),
          });
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

      const rowHits: FileHit[] = [];
      const seen: SeenFile[] = [];
      const first = Math.max(0, Math.floor(origin / line));
      const lastRow = Math.min(
        drawn.count - 1,
        Math.floor((origin + viewHeight) / line),
      );
      const shown: (ShownRow<FileRecord> & { top: number })[] = [];
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
      const presented = canvas.present(
        view,
        shown,
        [lookKey, width, origin, viewHeight, pixelWidth].join(' '),
        () => {
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
        },
      );
      if (presented === 'full') {
        draw();
        return;
      }
      if (presented === 'same') {
        return;
      }
      for (const each of shown) {
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
