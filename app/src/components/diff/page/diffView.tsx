import {
  observeElementOffset,
  useVirtualizer,
  type Virtualizer,
} from '@tanstack/react-virtual';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TextRequest } from '../shared/diffProtocol';
import type { DiffFile, DiffLine } from './diff';
import type { LoadedText } from './sideTexts';
import { type FindMatch } from './find';
import { lineKey } from './diffLines';
import { Minimap } from './minimap';
import { columnFocusAttribute } from '../../../lib/page/columnFocus';
import { shortcutsEntryAttribute } from '../../../lib/page/shortcutsEntry';
import { useSyntax, noSyntaxInput } from './diffSyntax';
import { useTextsToLoad } from './textsToLoad';
import { wordRanges, type LineWords } from './wordDiff';
import { ownScrollbarAttribute } from '../../../lib/page/overlayScrollbars';
import { type ImageOrigin } from './diffImages';
import { useSkeleton } from '../../../lib/page/skeletonDelay';
import { wrapIndent } from '../../../lib/page/wordWrap';
import { snapOffset } from '../../../lib/page/devicePixels';
import { snappedTop, type RowFollower } from '../../../lib/page/rowScroll';
import type { DiffLook } from './diffLook';
import type { DiffMeasures, DiffMeasuring } from './diffMeasures';
import {
  shownSideways,
  widestColumns,
  type Sideways,
  type TextArea,
} from './overflow';
import { cellWidthsOf } from '../../../lib/page/textWidths';
import {
  type WholeFile,
  type DiffRow,
  type FileHeaderRow,
  waitingRows,
  diffRows,
  lineKeys,
} from './diffRows';
import { showsSideBySide, splitPairs } from './sideBySideRows';
import { rowMeasures, rowHeight } from './rowMeasures';
import { RowContent, rowOverscan } from './rowContent';
import { sideScroll, sideRoom } from './sidewaysScroll';
import { rowAnchors, useScrollAnchor } from './diffScrollAnchor';
import { unplaced, type DiffPlace } from './diffPlace';
import type { PlaceChange } from './diffSlice';
import { useKeptPlace } from './diffKeptPlace';
import { scrollOnToggle, stuckHeader } from './diffStuckHeader';
import {
  type LineMarks,
  changedWords,
  codeProps,
  findRangesByLine,
} from './lineMarks';
import { useDiffMinimapMarks } from './diffMinimap';
import { Code } from './codeMarks';
import { unmeasured, gapWidth, layoutVariables, lineWidth } from './textLayout';
import { WrapProbe, TextProbe } from './textProbes';
import { selectionSide } from './selectionSide';
import { DiffRowShown, type DiffRowParts } from './diffRowShown';
import { useSideways } from './diffSideways';
import { useFoundJumps, useRevealFound } from './diffJumps';
import { useLargeFileLoads } from './diffLargeFiles';
import { diffRowClass, diffRowPlace } from './diffRowClasses';
import { FileHeader, HiddenChangeMarks } from './diffRowParts';
import { useDiffText } from './diffText';
import { useDiffFollow } from './diffFollow';
import { diffKeyDown } from './diffKeys';

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
  look,
  measures,
  measuring,
  keptPlace,
  onPlace,
}: {
  keptPlace: DiffPlace | undefined;
  onPlace: (change: PlaceChange) => void;
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
  look: DiffLook;
  measures: DiffMeasures;
  measuring: DiffMeasuring;
}) {
  const {
    sideBySide,
    wordWrap,
    showWhitespace,
    highlightSyntax,
    scrolling,
    root,
    language: chosenLanguage,
  } = look;
  const list = useRef<HTMLDivElement>(null);
  const split = showsSideBySide(sideBySide, whole);
  const scrollsSides = split && !wordWrap;
  const columns = measures.wrapColumns;
  const { keepWrapColumns } = measuring;
  const {
    table,
    charWidth,
    widths,
    columnsIn,
    padding,
    scale,
    lineHeight,
    measureText,
    snap,
  } = useDiffText(list, measures, measuring);
  const sideways = keptPlace?.sideways ?? unplaced.sideways;
  const setSideways = useCallback(
    (scrolled: number) => onPlace({ sideways: scrolled }),
    [onPlace],
  );
  const { measured, measureSideways } = useSideways(
    list,
    scrollsSides,
    wordWrap,
    sideways,
    setSideways,
  );
  const view = measured && shownSideways(measured, scrollsSides, sideways);
  const changeColumns = keepWrapColumns;
  const toggled = keptPlace?.toggled ?? unplaced.toggled;
  const setToggled = useCallback(
    (
      change: (
        toggled: ReadonlyMap<string, boolean>,
      ) => ReadonlyMap<string, boolean>,
    ) => onPlace((place) => ({ toggled: change(place.toggled) })),
    [onPlace],
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

  const endPadding = useDiffFollow({
    list,
    followerRef: follower,
    offsetSeen,
    virtualizer,
    lineHeight,
    scrolling,
  });

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
    placed: keptPlace !== undefined,
  });
  useLargeFileLoads({ files, toggled, diff, onLoad });

  const header = (row: FileHeaderRow, stuck = false) => (
    <FileHeader
      path={row.path}
      root={root}
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
      columns={wrapsAt}
      lineHeight={lineHeight}
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
  const marks = useDiffMinimapMarks({
    rows,
    keys,
    rangesByLine,
    changeMarks,
    virtualizer,
  });

  const scrollTop = virtualizer.scrollOffset ?? 0;
  const stuck = stuckHeader(rows, items, scrollTop);

  const anchors = useMemo(() => rowAnchors(rows, keys), [rows, keys]);
  useScrollAnchor({
    list,
    virtualizer,
    shown: anchors,
    split,
    wordWrap,
    columns,
  });
  useKeptPlace({
    list,
    place: keptPlace,
    onPlace,
    settled:
      !loading &&
      table !== undefined &&
      items.length > 0 &&
      (wordWrap ? columns !== undefined : charWidth > 0) &&
      !files.some(
        (file) => file.placeholder && toggled.get(file.path) === true,
      ),
    virtualizer,
    anchors,
    scrollsSides,
    reveal,
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
        onKeyDown={(event) =>
          diffKeyDown(event, {
            scrollsSides,
            sideways,
            setSideways,
            widths,
            follower,
            virtualizer,
            rows,
            lineHeight,
          })
        }
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
