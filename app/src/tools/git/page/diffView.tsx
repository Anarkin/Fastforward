import {
  observeElementOffset,
  useVirtualizer,
  type Virtualizer,
} from '@tanstack/react-virtual';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TextRequest } from '../shared/protocol';
import type { DiffFile, DiffLine, LoadedText } from './diff';
import { jumpStep, lineKey, type FindMatch } from './find';
import { Minimap } from './minimap';
import { columnFocusAttribute } from '../../../lib/page/columnFocus';
import {
  shortcutsEntryAttribute,
  keyPressed,
} from '../../../lib/page/shortcuts';
import { useSyntax, useTextsToLoad } from './syntax';
import { wordRanges, type LineWords } from './wordDiff';
import { gitKeymap } from './keymap';
import {
  glideAt,
  glideBy,
  glideEnded,
  type Glide,
} from '../../../lib/page/glide';
import { strings } from '../../../lib/shared/strings';
import { Words } from '../../../lib/page/name';
import { listMoveOf } from '../../../lib/page/listMoves';
import {
  elementMetrics,
  ownScrollbarAttribute,
  setSidewaysScroller,
  sidewaysMetrics,
  sidewaysScroll,
  sidewaysScrollEvent,
} from '../../../lib/page/overlayScrollbars';
import { ImageDiff, imagePanes } from './imagePreview';
import { WholeImage } from '../../../lib/page/images';
import { wholeImageUrl, type ImageOrigin } from './images';
import { useSkeleton } from './skeleton';
import { type ColumnsIn, wrapIndent } from '../../../lib/page/wordWrap';
import { snapOffset } from '../../../lib/page/devicePixels';
import { afterPaint } from '../../../lib/page/afterPaint';
import {
  followRows,
  rowPadding,
  snappedTop,
  type RowFollower,
} from '../../../lib/page/rowScroll';
import { useShell } from '../../../shell/page/store';
import { pickedFor, useGit, useGitActions } from './store';
import {
  inlineArea,
  lineWidth,
  markerInset,
  markerWidth,
  numberWidth,
  shownSideways,
  sideArea,
  type Sideways,
  type TextArea,
} from './overflow';
import {
  cellWidthsOf,
  columnsOf,
  plainCells,
  textWidths,
  useCellTable,
} from '../../../lib/page/textWidths';
import {
  type WholeFile,
  showsSideBySide,
  type DiffRow,
  type FileHeaderRow,
  sideChange,
  waitingRows,
  diffRows,
  largeDiffText,
  splitPairs,
  lineKeys,
} from './diffRows';
import {
  uniformHeight,
  rowLines,
  RowContent,
  rowOverscan,
  rowMeasures,
  rowHeight,
} from './rowMeasures';
import {
  sideScroll,
  wheelSideways,
  diffScrollLeft,
  changeStarts,
  changeMargin,
  keyedScrollTop,
  firstChangeTop,
  scrollOnToggle,
  rowAnchors,
  type ScrollAnchor,
  scrollAnchor,
  anchoredScrollTop,
  stuckHeader,
  foundScroll,
  foundMiddle,
  foundEdges,
  sideRoom,
  diffRowPlace,
  type Edges,
} from './diffScrolling';
import {
  type LineMarks,
  changedWords,
  wholeChangeClass,
  codeProps,
  Code,
  findRangesByLine,
  noSyntaxInput,
  noMarksInput,
  diffMinimapMarks,
} from './codeMarks';
import {
  unmeasured,
  WrapProbe,
  gapWidth,
  unpadded,
  sideSnaps,
  codeSnapOf,
  codeStarts,
  sameSnap,
  TextProbe,
  readSideways,
  sameSideways,
  layoutVariables,
  widestColumns,
} from './textProbes';
import { WrapMarks, selectionSide } from './wrapMarks';
import {
  HunkDivider,
  FileHeader,
  FileNote,
  DiffSkeleton,
  diffRowClass,
  splitSideClass,
  HiddenChangeMarks,
} from './diffRowParts';

declare module 'react' {
  interface CSSProperties {
    readonly '--diff-file-height'?: string;
    readonly '--diff-row-top'?: string;
    readonly '--diff-tab-size'?: string;
    readonly '--diff-number-width'?: string;
    readonly '--diff-code-padding'?: string;
    readonly '--diff-marker-width'?: string;
    readonly '--diff-content-width'?: string;
    readonly '--diff-word-padding-top'?: string;
    readonly '--diff-gap-width'?: string;
    readonly '--diff-word-padding-bottom'?: string;
    readonly '--split-scroll'?: string;
    readonly '--diff-snap-inline'?: string;
    readonly '--diff-snap-left'?: string;
    readonly '--diff-snap-right'?: string;
    readonly '--diff-side-snap'?: string;
    readonly '--wrap-indent'?: string;
    readonly '--visible-left'?: string;
    readonly '--visible-right'?: string;
  }
}

export function largeFilesToLoad(
  files: readonly DiffFile[],
  toggled: ReadonlyMap<string, boolean>,
  diff: number,
  requested: Map<string, number>,
): string[] {
  const load: string[] = [];
  for (const file of files) {
    if (!file.placeholder || toggled.get(file.path) !== true) {
      requested.delete(file.path);
    } else if (requested.get(file.path) !== diff) {
      requested.set(file.path, diff);
      load.push(file.path);
    }
  }
  return load;
}

export function DiffView({
  error,
  files,
  whole,
  loading,
  diff,
  onLoad,
  texts,
  onLoadTexts,
  changeMarks,
  matches,
  current,
  jump,
  firstChange,
  finding = false,
  origin,
  viewOf,
  languageKey,
}: {
  error: React.ReactNode;
  files: readonly DiffFile[];
  whole: WholeFile | undefined;
  origin: ImageOrigin | undefined;
  loading: boolean;
  diff: number;
  onLoad: (path: string) => void;
  texts: ReadonlyMap<string, LoadedText>;
  onLoadTexts: (texts: TextRequest[]) => void;
  changeMarks: boolean;
  matches: readonly FindMatch[];
  current: number;
  jump: number;
  firstChange: number | undefined;
  finding?: boolean;
  viewOf?: (file: number) => (() => void) | undefined;
  languageKey?: string;
}) {
  const sideBySide = useGit((state) => state.diffLayout === 'sideBySide');
  const chosenLanguage = useGit(pickedFor(languageKey));
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const list = useRef<HTMLDivElement>(null);
  const [sideways, setSideways] = useState(0);
  const scrolledSideways = useRef(sideways);
  const split = showsSideBySide(sideBySide, whole);
  const scrollsSides = split && !wordWrap;
  const columns = useGit((state) => state.wrapColumns);
  const measuredText = useGit((state) => state.diffText);
  const { measureDiffText, snapDiffCode, keepWrapColumns } = useGitActions();
  const charWidth = measuredText?.charWidth ?? 0;
  const font = measuredText?.font ?? '';
  const spacing = measuredText?.spacing ?? 0;
  const table = useCellTable();
  const widths = useMemo(
    () => textWidths(charWidth, font, spacing, table ?? plainCells),
    [charWidth, font, spacing, table],
  );
  const columnsIn = useMemo<ColumnsIn | undefined>(
    () =>
      widths.char > 0 ? (row: string) => columnsOf(row, widths) : undefined,
    [widths],
  );
  const padding = measuredText?.padding ?? unpadded;
  const scale = measuredText?.scale ?? 1;
  const lineHeight = measuredText?.lineHeight ?? uniformHeight;
  const measureText = useCallback(
    (
      width: number,
      measuredFont: string,
      measured: Edges,
      measuredScale: number,
      measuredLineHeight: number,
      measuredSpacing: number,
    ) =>
      measureDiffText({
        charWidth: width,
        font: measuredFont,
        spacing: measuredSpacing,
        scale: measuredScale,
        lineHeight: measuredLineHeight,
        padding: measured,
      }),
    [measureDiffText],
  );
  const [measured, setMeasured] = useState<Sideways>();
  const snap = useGit((state) => state.diffSnap);
  const snapCode = useCallback(() => {
    const element = list.current;
    if (!element) {
      return;
    }
    snapDiffCode((last) => {
      const next = codeSnapOf(codeStarts(element), devicePixelRatio, last);
      return sameSnap(last, next) ? last : next;
    });
  }, [snapDiffCode]);
  useLayoutEffect(snapCode);
  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(snapCode);
    observer.observe(element);
    return () => observer.disconnect();
  }, [snapCode]);
  const view = measured && shownSideways(measured, scrollsSides, sideways);
  const changeColumns = keepWrapColumns;
  useEffect(() => {
    const element = list.current;
    if (!element || !scrollsSides) {
      return undefined;
    }
    let glide: Glide | undefined;
    let frameWidest: number | undefined;
    let frame: number | undefined;
    const scroll = () => {
      frame = undefined;
      frameWidest = undefined;
      if (!glide) {
        return;
      }
      const now = performance.now();
      setSideways(glideAt(glide, now));
      if (glideEnded(glide, now)) {
        glide = undefined;
      } else {
        frame = requestAnimationFrame(scroll);
      }
    };
    const onWheel = (event: WheelEvent) => {
      const { delta, duration } = wheelSideways(event);
      if (delta === 0) {
        return;
      }
      event.preventDefault();
      frameWidest ??= sideRoom(element).widest;
      glide = glideBy(
        glide,
        scrolledSideways.current,
        performance.now(),
        delta,
        duration,
        frameWidest,
      );
      frame ??= requestAnimationFrame(scroll);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    setSidewaysScroller(element, {
      metrics: () => {
        const { side, widest } = sideRoom(element);
        return sidewaysMetrics(
          elementMetrics(element),
          side,
          widest,
          scrolledSideways.current,
        );
      },
      scrollTo: (scrollLeft) => {
        const { side, widest } = sideRoom(element);
        const left = sidewaysScroll(scrollLeft, element.clientWidth, side);
        setSideways(Math.max(0, Math.min(widest, left)));
      },
    });
    return () => {
      element.removeEventListener('wheel', onWheel);
      setSidewaysScroller(element, undefined);
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  }, [scrollsSides]);
  useEffect(() => {
    if (scrolledSideways.current !== sideways) {
      scrolledSideways.current = sideways;
      list.current?.dispatchEvent(new Event(sidewaysScrollEvent));
    }
  }, [sideways]);
  const measureSideways = useCallback(() => {
    const element = list.current;
    if (!element || wordWrap) {
      setMeasured(undefined);
      return;
    }
    const next = readSideways(element, scrollsSides);
    setMeasured((last) => (sameSideways(last, next) ? last : next));
  }, [wordWrap, scrollsSides]);
  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(measureSideways);
    observer.observe(element);
    const painted = afterPaint(measureSideways);
    element.addEventListener('scroll', painted.ask, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', painted.ask);
      painted.cancel();
    };
  }, [measureSideways]);
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
  const skeleton = useSkeleton(loading);
  const rows = useMemo(
    () =>
      table === undefined
        ? waitingRows
        : diffRows(files, toggled, whole, skeleton, sideBySide),
    [files, toggled, whole, skeleton, sideBySide, table],
  );

  const wrapping = wordWrap ? columns : undefined;
  const [dragged, setDragged] = useState(false);
  const offsetSeen = useRef<(offset: number) => void>(undefined);
  const observeOffset = useCallback(
    (
      instance: Virtualizer<HTMLDivElement, Element>,
      seen: (offset: number, isScrolling: boolean) => void,
    ) => {
      offsetSeen.current = (offset) => seen(offset, true);
      return observeElementOffset(instance, seen);
    },
    [],
  );
  const shownRow = useRef(0);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => list.current,
    ...rowMeasures(
      rows,
      wordWrap ? (columns ?? unmeasured) : undefined,
      lineHeight,
      scale,
      wordWrap && table !== undefined ? cellWidthsOf(table) : undefined,
      shownRow,
      Boolean(error),
    ),
    overscan: rowOverscan(dragged),
    observeElementOffset: observeOffset,
  });
  const scrollTarget = useRef<number>(undefined);
  const scrollFrame = useRef<number>(undefined);
  const scrolling = useShell((state) => state.scrolling);
  const follower = useRef<RowFollower>(undefined);
  const scrollToTop = useCallback(
    (top: number) => {
      if (scrolling.smooth && follower.current) {
        follower.current.scrollTo(top, true);
        return;
      }
      scrollTarget.current = snappedTop(top, lineHeight, Infinity);
      scrollFrame.current ??= requestAnimationFrame(() => {
        scrollFrame.current = undefined;
        const target = scrollTarget.current;
        if (target === undefined) {
          return;
        }
        virtualizer.scrollToOffset(target);
        if (list.current) {
          offsetSeen.current?.(list.current.scrollTop);
        }
      });
    },
    [virtualizer, lineHeight, scrolling.smooth],
  );
  useEffect(
    () => () => {
      if (scrollFrame.current !== undefined) {
        cancelAnimationFrame(scrollFrame.current);
      }
    },
    [],
  );

  const [viewportHeight, setViewportHeight] = useState(0);
  const endPadding = rowPadding(viewportHeight, lineHeight);
  const lineOf = useEffectEvent(() => lineHeight);
  const totalOf = useEffectEvent(() => virtualizer.getTotalSize());
  const perNotch = useEffectEvent(() => scrolling.wheelRows);
  const smooth = useEffectEvent(() => scrolling.smooth);
  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    const viewport = () => element.getBoundingClientRect().height;
    const following = followRows(element, lineOf, {
      limit: () => totalOf() + rowPadding(viewport(), lineOf()) - viewport(),
      perNotch,
      smooth,
      onPlace: (top) => offsetSeen.current?.(top),
    });
    follower.current = following;
    const measure = () => setViewportHeight(viewport());
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      following.stop();
      follower.current = undefined;
      observer.disconnect();
    };
  }, []);

  const toggle = (path: string, open: boolean) =>
    setToggled((all) => new Map(all).set(path, !open));

  const keys = useMemo(() => lineKeys(rows), [rows]);
  const widest = useMemo(
    () =>
      split || wordWrap
        ? 0
        : widestColumns(rows, widths.char > 0 ? widths : undefined),
    [rows, split, wordWrap, widths],
  );
  const words = useMemo(
    () =>
      whole
        ? new Map<string, LineWords>()
        : wordRanges(files, split ? splitPairs(rows) : undefined),
    [files, whole, split, rows],
  );
  const open = useMemo(
    () =>
      new Set(
        rows.flatMap((row) =>
          row.kind === 'file' && row.open ? [row.file] : [],
        ),
      ),
    [rows],
  );
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const syntaxInput = useDeferredValue(
    useMemo(() => ({ files, whole, texts, open }), [files, whole, texts, open]),
    noSyntaxInput,
  );
  const syntax = useSyntax(
    syntaxInput.files,
    syntaxInput.whole,
    syntaxInput.texts,
    syntaxInput.open,
    highlightSyntax || chosenLanguage !== undefined,
    chosenLanguage,
  );
  useTextsToLoad(files, whole, diff, open, texts, chosenLanguage, onLoadTexts);
  const rangesByLine = useMemo(() => findRangesByLine(matches), [matches]);
  const found = matches.at(current);
  const foundKey = found && lineKey(found.file, found.line);
  const jumped = useRef(0);
  const [revealing, setRevealing] = useState<string>();
  useEffect(() => {
    if (jumped.current === jump) {
      return;
    }
    const header =
      found &&
      rows.find((row) => row.kind === 'file' && row.file === found.file);
    const closed = header?.kind === 'file' && !header.open;
    switch (jumpStep(found !== undefined, loading, !closed)) {
      case 'wait':
        return;
      case 'done':
        jumped.current = jump;
        return;
      case 'open':
        if (header?.kind === 'file') {
          setToggled((all) => new Map(all).set(header.path, true));
        }
        return;
      case 'scroll': {
        const index = keys.findIndex((row) => row.includes(foundKey ?? ''));
        if (index !== -1) {
          virtualizer.scrollToIndex(index, { align: 'center' });
          jumped.current = jump;
          setRevealing(foundKey);
        }
      }
    }
  }, [jump, found, foundKey, loading, rows, keys, virtualizer]);

  const changeJumped = useRef<number>(undefined);
  useEffect(() => {
    if (
      firstChange === undefined ||
      changeJumped.current === firstChange ||
      loading
    ) {
      return;
    }
    changeJumped.current = firstChange;
    if (found !== undefined) {
      return;
    }
    const top = firstChangeTop(
      changeStarts(rows).map(
        (index) => virtualizer.measurementsCache[index]?.start ?? 0,
      ),
      changeMargin(lineHeight),
    );
    if (top !== undefined) {
      virtualizer.scrollToOffset(top);
    }
  }, [firstChange, loading, found, rows, virtualizer, lineHeight]);

  const requested = useRef(new Map<string, number>());
  useEffect(() => {
    for (const path of largeFilesToLoad(
      files,
      toggled,
      diff,
      requested.current,
    )) {
      onLoad(path);
    }
  }, [files, toggled, diff, onLoad]);

  const header = (row: FileHeaderRow, stuck = false) => (
    <FileHeader
      path={row.path}
      oldPath={row.oldPath}
      open={row.open}
      whole={whole !== undefined}
      collapsible={row.collapsible}
      onView={viewOf?.(row.file)}
      onClick={() => {
        if (!row.collapsible) {
          return;
        }
        toggle(row.path, row.open);
        const target = scrollOnToggle(rows, row, stuck);
        if (target !== undefined) {
          virtualizer.scrollToIndex(target, { align: 'start' });
        }
      }}
    />
  );

  const lineMarks: LineMarks = {
    syntax,
    words,
    finds: rangesByLine,
    foundKey,
    found,
    whitespace: showWhitespace,
    widths,
  };
  const code = (
    key: string | undefined,
    text: string,
    kind: DiffLine['kind'] | undefined,
    wrapsAt: number | undefined,
  ) => (
    <Code
      {...codeProps(lineMarks, key, text, kind)}
      indent={wrapsAt === undefined ? undefined : wrapIndent(text, wrapsAt)}
    />
  );

  const reveal = useCallback(
    (scrolled: number) => {
      if (scrollsSides) {
        setSideways(scrolled);
      } else if (list.current) {
        list.current.scrollLeft = scrolled;
      }
    },
    [scrollsSides],
  );
  const hiddenMarks = (
    key: string | undefined,
    line: DiffLine,
    area: (shown: Sideways) => TextArea,
    place: (edge: 'left' | 'right') => React.CSSProperties,
  ) =>
    view && (
      <HiddenChangeMarks
        text={line.text}
        words={changedWords(words, key)}
        kind={line.kind}
        view={view}
        area={area(view)}
        widths={widths}
        place={place}
        onReveal={reveal}
      />
    );

  const renderRow = (row: DiffRow, index: number) => {
    switch (row.kind) {
      case 'error':
        return error;
      case 'file':
        return header(row);
      case 'large':
        return (
          <div className="large-diff">
            {largeDiffText(row.lines)}
            <button onClick={() => toggle(row.path, false)}>
              {strings.diff.show}
            </button>
          </div>
        );
      case 'binary':
        return whole ? (
          <div className="file-note">{strings.diff.binaryOrLarge}</div>
        ) : (
          <FileNote
            text={strings.diff.binary}
            change={row.change ?? sideChange(files[row.file])}
            split={split}
          />
        );
      case 'empty':
        return (
          <FileNote
            text={strings.diff.emptyFile}
            change={row.change ?? sideChange(files[row.file])}
            split={split}
          />
        );
      case 'sameContent':
        return (
          <FileNote
            text={
              files[row.file].copied
                ? strings.diff.copiedWithoutChanges
                : strings.diff.renamedWithoutChanges
            }
            change={undefined}
            split={split}
          />
        );
      case 'link': {
        const text = strings.diff.symbolicLink(
          (whole ? whole.content : files[row.file].link?.[row.side]) ?? '',
        );
        return whole ? (
          <div className="file-note">
            <Words>{text}</Words>
          </div>
        ) : (
          <FileNote
            text={text}
            change={row.side === 'old' ? 'removed' : 'added'}
            split={split}
          />
        );
      }
      case 'mode': {
        const modes = files[row.file].modeChange;
        return (
          modes && (
            <FileNote
              text={strings.diff.modeChanged(modes.old, modes.new)}
              change={undefined}
              split={split}
            />
          )
        );
      }
      case 'whitespace':
        return (
          <FileNote
            text={strings.diff.onlyWhitespace}
            change={undefined}
            split={split}
          />
        );
      case 'noNewline':
        return (
          <FileNote
            text={strings.diff.noNewlineAtEnd}
            change={
              files[row.file].noNewlineAtEnd === 'old' ? 'removed' : 'added'
            }
            split={split}
          />
        );
      case 'image': {
        if (!origin) {
          return null;
        }
        if (whole) {
          const url = wholeImageUrl(origin, whole);
          return url && <WholeImage url={url} />;
        }
        return <ImageDiff panes={imagePanes(origin, files[row.file], split)} />;
      }
      case 'skeleton':
        return (
          <div className="diff-skeleton">
            <div className="file-header">
              <span className="bar" style={{ width: '40%' }} />
            </div>
            <DiffSkeleton split={split} rows={9} />
          </div>
        );
      case 'skeletonLines':
        return <DiffSkeleton split={split} rows={4} />;
      case 'hunk':
        return <HunkDivider />;
      case 'line':
        return (
          <div
            className={`diff-line text-line ${row.line.kind} ${wholeChangeClass(words, keys[index].at(0))}`}
          >
            <span className="number">{row.line.oldNumber}</span>
            <span className="number">{row.line.newNumber}</span>
            {code(
              keys[index].at(0),
              row.line.text,
              row.line.kind,
              wrapping?.left,
            )}
            <WrapMarks
              text={row.line.text}
              columns={wrapping?.left}
              numbers={2}
              lineHeight={lineHeight}
              columnsIn={columnsIn}
              widths={widths}
            />
            {hiddenMarks(
              keys[index].at(0),
              row.line,
              (shown) => inlineArea(shown, 2),
              (edge) =>
                edge === 'left'
                  ? { left: `calc(var(--visible-left) + ${markerInset}px)` }
                  : {
                      left: `calc(var(--visible-right) - ${markerInset + markerWidth}px)`,
                    },
            )}
          </div>
        );
      case 'split':
        return (
          <div className="split-line">
            {[row.left, row.right].map((cell, side) => (
              <div
                key={side}
                className={`diff-line text-line split-side ${splitSideClass(cell, side === 0 ? 'removed' : 'added')} ${cell ? wholeChangeClass(words, lineKey(row.file, cell.index)) : ''}`}
                style={sideSnaps[side]}
              >
                <span className="number">
                  {side === 0 ? cell?.line.oldNumber : cell?.line.newNumber}
                </span>
                <span className="split-code">
                  {cell &&
                    code(
                      lineKey(row.file, cell.index),
                      cell.line.text,
                      cell.line.kind,
                      side === 0 ? wrapping?.left : wrapping?.right,
                    )}
                </span>
                {cell && (
                  <WrapMarks
                    text={cell.line.text}
                    columns={side === 0 ? wrapping?.left : wrapping?.right}
                    numbers={1}
                    lineHeight={lineHeight}
                    columnsIn={columnsIn}
                    widths={widths}
                  />
                )}
                {cell &&
                  hiddenMarks(
                    lineKey(row.file, cell.index),
                    cell.line,
                    (shown) => sideArea(shown, side === 1),
                    (edge) =>
                      edge === 'left'
                        ? { left: numberWidth + markerInset }
                        : {
                            right:
                              side === 1
                                ? `calc(var(--minimap-width) + ${markerInset}px)`
                                : markerInset,
                          },
                  )}
              </div>
            ))}
          </div>
        );
      case 'wholeLine':
        return (
          <div className="diff-line text-line">
            <span className="number">{row.number}</span>
            {code(keys[index].at(0), row.text, undefined, wrapping?.left)}
            <WrapMarks
              text={row.text}
              columns={wrapping?.left}
              numbers={1}
              lineHeight={lineHeight}
              columnsIn={columnsIn}
              widths={widths}
            />
          </div>
        );
      default:
        return row satisfies never;
    }
  };

  const rowInputs = [
    error,
    rows,
    files,
    whole,
    origin,
    split,
    viewOf,
    virtualizer,
    keys,
    syntax,
    words,
    rangesByLine,
    foundKey,
    found,
    showWhitespace,
    wrapping,
    lineHeight,
    columnsIn,
    widths,
    reveal,
    view === undefined,
    view?.scrolled,
    view?.width,
    view?.room,
    view?.minimap,
  ];

  const items = virtualizer.getVirtualItems();
  useLayoutEffect(() => {
    shownRow.current = items[0]?.index ?? 0;
  }, [items]);
  useLayoutEffect(() => {
    const element = list.current;
    if (element && scrollsSides && sideways > 0) {
      const within = sideScroll(sideways, sideRoom(element).widest);
      if (within !== sideways) {
        setSideways(within);
      }
    }
  }, [items, rows, scrollsSides, sideways]);
  useLayoutEffect(measureSideways, [measureSideways, items, rows]);
  useLayoutEffect(() => {
    const element = list.current;
    if (!revealing || !element) {
      return;
    }
    const index =
      revealing === foundKey
        ? keys.findIndex((row) => row.includes(revealing))
        : -1;
    if (index !== -1 && !items.some((item) => item.index === index)) {
      return;
    }
    setRevealing(undefined);
    if (!found || index === -1) {
      return;
    }
    if (wordWrap) {
      const row = element.querySelector(`.virtual-row[data-index="${index}"]`);
      const edges = row ? foundEdges(row) : undefined;
      const start = virtualizer
        .getVirtualItems()
        .find((item) => item.index === index)?.start;
      if (row && edges && start !== undefined) {
        const box = element.getBoundingClientRect();
        const middle = foundMiddle(
          edges,
          {
            top: box.top + rowLines.file * lineHeight,
            bottom: box.top + element.clientHeight,
          },
          { top: row.getBoundingClientRect().top, start },
        );
        if (middle !== undefined) {
          virtualizer.scrollToOffset(middle, { align: 'center' });
        }
      }
      return;
    }
    if (widths.char === 0) {
      return;
    }
    const shown = shownSideways(
      readSideways(element, scrollsSides),
      scrollsSides,
      sideways,
    );
    const scrolled = foundScroll(rows[index], found, shown, widths);
    if (scrolled !== undefined && scrolled !== shown.scrolled) {
      reveal(scrolled);
    }
  }, [
    revealing,
    found,
    foundKey,
    keys,
    items,
    rows,
    wordWrap,
    widths,
    scrollsSides,
    sideways,
    reveal,
    virtualizer,
    lineHeight,
  ]);
  const measurements = virtualizer.measurementsCache;
  const marksInput = useDeferredValue(
    useMemo(
      () => ({
        rows,
        keys,
        matched: rangesByLine,
        changeMarks,
        measurements,
      }),
      [rows, keys, rangesByLine, changeMarks, measurements],
    ),
    noMarksInput,
  );
  const marks = useMemo(
    () =>
      diffMinimapMarks(
        marksInput.rows,
        marksInput.keys,
        marksInput.matched,
        marksInput.changeMarks,
        (index) => marksInput.measurements[index]?.size,
      ),
    [marksInput],
  );

  const scrollTop = virtualizer.scrollOffset ?? 0;
  const stuck = stuckHeader(rows, items, scrollTop);

  const layoutKey = `${split}:${wordWrap ? `${columns?.left}:${columns?.right}` : ''}`;
  const shown = useMemo(() => rowAnchors(rows, keys), [rows, keys]);
  const anchor = useRef<{ key: string; at: ScrollAnchor | undefined }>(
    undefined,
  );
  useLayoutEffect(() => {
    const last = anchor.current;
    if (last?.at && last.key !== layoutKey) {
      anchor.current = { key: layoutKey, at: last.at };
      const top = anchoredScrollTop(
        last.at,
        virtualizer.measurementsCache,
        shown,
      );
      if (top !== undefined) {
        virtualizer.scrollToOffset(top);
      }
      return;
    }
    anchor.current = {
      key: layoutKey,
      at: scrollAnchor(
        virtualizer.measurementsCache,
        shown,
        list.current?.scrollTop ?? 0,
      ),
    };
  });

  return (
    <div
      className={`diff-view ${split ? 'side-by-side' : ''} ${wordWrap ? 'wrap' : ''} ${showWhitespace ? 'show-whitespace' : ''}`}
      onMouseDown={(event) => {
        const side = selectionSide(
          event.target instanceof Element ? event.target : null,
        );
        if (side === undefined) {
          delete event.currentTarget.dataset.selecting;
        } else {
          event.currentTarget.dataset.selecting = side;
        }
      }}
      style={{
        ...layoutVariables,
        '--split-scroll': `${sideways + snapOffset(sideways, scale)}px`,
        '--diff-snap-inline': `${snap.inline}px`,
        '--diff-snap-left': `${snap.left}px`,
        '--diff-snap-right': `${snap.right}px`,
        '--diff-word-padding-top': `${padding.top}px`,
        '--diff-word-padding-bottom': `${padding.bottom}px`,
        '--diff-gap-width': `${gapWidth(scale)}px`,
        ...(!split &&
          !wordWrap &&
          charWidth > 0 && {
            '--diff-content-width': `${lineWidth(widest, whole ? 1 : 2, charWidth)}px`,
          }),
        ...(view &&
          !scrollsSides && {
            '--visible-left': `${view.scrolled}px`,
            '--visible-right': `${view.scrolled + view.width - view.minimap}px`,
          }),
      }}
    >
      <Minimap
        marks={marks}
        scroller={list}
        viewport={virtualizer.scrollRect?.height ?? 0}
        total={virtualizer.getTotalSize()}
        pinned={finding}
        onDrag={setDragged}
        onScroll={scrollToTop}
      />
      <div
        className="virtual-rows"
        ref={list}
        tabIndex={0}
        {...{
          [ownScrollbarAttribute]: '',
          [columnFocusAttribute]: '',
          [shortcutsEntryAttribute]: 'diff',
        }}
        onKeyDown={(event) => {
          const side = keyPressed(gitKeymap.sideways, event);
          const left =
            side === undefined
              ? undefined
              : scrollsSides
                ? diffScrollLeft(
                    side,
                    sideways,
                    sideRoom(event.currentTarget).widest,
                    widths.char,
                  )
                : diffScrollLeft(
                    side,
                    event.currentTarget.scrollLeft,
                    undefined,
                    widths.char,
                  );
          if (left !== undefined) {
            event.preventDefault();
            if (scrollsSides) {
              setSideways(left);
            } else {
              event.currentTarget.scrollLeft = left;
            }
            return;
          }
          const step = keyPressed(gitKeymap.change, event);
          const move = listMoveOf(event);
          const top = keyedScrollTop(
            step,
            move,
            follower.current?.aim() ?? event.currentTarget.scrollTop,
            event.currentTarget.clientHeight,
            virtualizer.getTotalSize(),
            lineHeight,
            () =>
              changeStarts(rows).map(
                (index) => virtualizer.measurementsCache[index]?.start ?? 0,
              ),
          );
          if (top === undefined) {
            return;
          }
          event.preventDefault();
          if (follower.current) {
            follower.current.scrollTo(
              top,
              step === undefined && (move === 'pageUp' || move === 'pageDown'),
            );
          } else {
            virtualizer.scrollToOffset(top);
          }
        }}
      >
        {stuck && (
          <div className="diff-stuck-header">{header(stuck, true)}</div>
        )}
        <div
          className="virtual-spacer"
          style={{ height: virtualizer.getTotalSize() + endPadding }}
        >
          <TextProbe onMeasure={measureText} />
          {wordWrap && (
            <WrapProbe
              key={split ? 'split' : whole ? 'whole' : 'inline'}
              split={split}
              numbers={whole ? 1 : 2}
              onColumns={changeColumns}
            />
          )}
          {items.map((item) => {
            const row = rows[item.index];
            const height = rowHeight(row, wordWrap, lineHeight, columns);
            return (
              <div
                key={item.key}
                className={diffRowClass(row.kind)}
                data-index={item.index}
                ref={height === undefined ? virtualizer.measureElement : null}
                style={diffRowPlace(item.start, height)}
              >
                <RowContent
                  row={row}
                  index={item.index}
                  inputs={rowInputs}
                  render={renderRow}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
