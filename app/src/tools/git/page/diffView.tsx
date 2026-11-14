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
import { lineKey, type FindMatch } from './find';
import { Minimap } from './minimap';
import { columnFocusAttribute } from '../../../lib/page/columnFocus';
import {
  shortcutsEntryAttribute,
  keyPressed,
} from '../../../lib/page/shortcuts';
import { useSyntax, useTextsToLoad } from './syntax';
import { wordRanges, type LineWords } from './wordDiff';
import { gitKeymap } from './keymap';
import { listMoveOf } from '../../../lib/page/listMoves';
import { ownScrollbarAttribute } from '../../../lib/page/overlayScrollbars';
import { type ImageOrigin } from './images';
import { useSkeleton } from './skeletonDelay';
import { type ColumnsIn, wrapIndent } from '../../../lib/page/wordWrap';
import { snapOffset } from '../../../lib/page/devicePixels';
import {
  followRows,
  rowPadding,
  snappedTop,
  type RowFollower,
} from '../../../lib/page/rowScroll';
import { useShell } from '../../../shell/page/store';
import { pickedFor, useGit, useGitActions } from './store';
import {
  lineWidth,
  shownSideways,
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
  waitingRows,
  diffRows,
  splitPairs,
  lineKeys,
} from './diffRows';
import {
  uniformHeight,
  RowContent,
  rowOverscan,
  rowMeasures,
  rowHeight,
} from './rowMeasures';
import {
  sideScroll,
  diffScrollLeft,
  changeStarts,
  keyedScrollTop,
  scrollOnToggle,
  rowAnchors,
  type ScrollAnchor,
  scrollAnchor,
  anchoredScrollTop,
  stuckHeader,
  sideRoom,
  diffRowPlace,
  type Edges,
} from './diffScrolling';
import {
  type LineMarks,
  changedWords,
  codeProps,
  findRangesByLine,
  noSyntaxInput,
  noMarksInput,
  diffMinimapMarks,
} from './lineMarks';
import { Code } from './codeMarks';
import {
  unmeasured,
  gapWidth,
  unpadded,
  codeSnapOf,
  codeStarts,
  sameSnap,
  layoutVariables,
  widestColumns,
} from './textLayout';
import { WrapProbe, TextProbe } from './textProbes';
import { selectionSide } from './selectionSide';
import { DiffRowShown, type DiffRowParts } from './diffRowShown';
import { useSideways } from './diffSideways';
import { useFoundJumps, useRevealFound } from './diffJumps';
import { diffRowClass } from './diffRowClasses';
import { FileHeader, HiddenChangeMarks } from './diffRowParts';

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
  const { sideways, setSideways, measured, measureSideways } = useSideways(
    list,
    scrollsSides,
    wordWrap,
  );
  const view = measured && shownSideways(measured, scrollsSides, sideways);
  const changeColumns = keepWrapColumns;
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
  const { revealing, setRevealing } = useFoundJumps({
    jump,
    found,
    foundKey,
    loading,
    rows,
    keys,
    virtualizer,
    setToggled,
    firstChange,
    lineHeight,
    files,
    toggled,
    diff,
    onLoad,
  });

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
    [scrollsSides, setSideways],
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

  const rowParts: DiffRowParts = {
    error,
    files,
    whole,
    origin,
    split,
    words,
    keys,
    wrapping,
    lineHeight,
    columnsIn,
    widths,
    header,
    toggle,
    code,
    hiddenMarks,
  };
  const renderRow = (row: DiffRow, index: number) => (
    <DiffRowShown row={row} index={index} parts={rowParts} />
  );

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
  }, [items, rows, scrollsSides, sideways, setSideways]);
  useLayoutEffect(measureSideways, [measureSideways, items, rows]);
  useRevealFound({
    list,
    revealing,
    setRevealing,
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
  });
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
