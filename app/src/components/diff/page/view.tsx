import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TextRequest } from '../shared/protocol';
import type { DiffFile, DiffLine } from './diff';
import type { LoadedText } from './sideTexts';
import { type FindMatch, type FindRange } from './find';
import { useSelectedCopy } from '../../../lib/page/selectedCopy';
import { copiesIn } from '../../../lib/shared/textMatches';
import { lineKey } from './lines';
import { columnFocusAttribute } from '../../../lib/page/columnFocus';
import { useSeenOffsets } from '../../../lib/page/seenOffsets';
import { shortcutsEntryAttribute } from '../../../lib/page/shortcutsEntry';
import { useSyntax, noSyntaxInput } from './syntax';
import { useTextsToLoad } from './textsToLoad';
import { wordRanges, type LineWords } from './wordDiff';
import { type ImageOrigin } from './images';
import { useSkeleton } from '../../../lib/page/skeletonDelay';
import { wrapIndent } from '../../../lib/page/wordWrap';
import type { RowFollower } from '../../../lib/page/rowScroll';
import type { DiffLook } from './look';
import type { DiffMeasures, DiffMeasuring } from './measures';
import { widestColumns, type Sideways, type TextArea } from './overflow';
import { cellWidthsOf } from '../../../lib/page/textWidths';
import {
  type WholeFile,
  type DiffRow,
  type FileHeaderRow,
  waitingRows,
  diffRows,
  fileNotes,
  lineKeys,
  wholeNotes,
} from './rows';
import { showsSideBySide, splitPairs } from './sideBySideRows';
import { rowMeasures, rowHeight } from './rowMeasures';
import { RowContent, rowsAround, rowsRoom } from './rowContent';
import { rowAnchors, useScrollAnchor } from './scrollAnchor';
import { unplaced, type DiffPlace } from './place';
import type { PlaceChange } from './slice';
import { useKeptPlace } from './placeKeeping';
import { scrollOnToggle, stuckHeader } from './stuckHeader';
import {
  type LineMarks,
  changedWords,
  codeProps,
  findRangesByLine,
} from './lineMarks';
import { useDiffMarks } from './rowMarks';
import { Code } from './codeMarks';
import { unmeasured, gapWidth, layoutVariables } from './textLayout';
import { WrapProbe, TextProbe } from './textProbes';
import { selectionSide } from './selectionSide';
import { DiffRowShown, type DiffRowParts } from './rowShown';
import { useSideways } from './sideways';
import { SidewaysBars } from './sidewaysBars';
import { ScrollbarMarks } from '../../../lib/page/scrollbarMarks';
import { scrollbarHeldAttribute } from '../../../lib/page/scrollbars';
import { leastMark, marksScale } from './changeMarks';
import { snappedLeft } from '../../../lib/page/columnScroll';
import { useLaterRows } from '../../../lib/page/laterRows';
import { useFoundJumps, useRevealFound } from './jumps';
import { useLargeFileLoads } from './largeFiles';
import { diffRowClass, diffRowPlace } from './rowClasses';
import { FileHeader, HiddenChangeMarks } from './rowParts';
import { useCodeSnap, useDiffText } from './text';
import { useDiffFollow } from './follow';
import { diffKeyDown } from './keys';

export function DiffView({
  error,
  files,
  whole,
  loading,
  diff,
  onLoad,
  texts,
  onLoadTexts,
  matches,
  findsText = false,
  current,
  jump,
  firstChange,
  origin,
  viewOf,
  viewKeys,
  look,
  measures,
  measuring,
  keptPlace,
  placeNow,
  onPlace,
}: {
  keptPlace: DiffPlace | undefined;
  placeNow: () => DiffPlace | undefined;
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
  matches: readonly FindMatch[];
  findsText?: boolean;
  current: number;
  jump: number;
  firstChange: number | undefined;
  viewOf?: (file: number) => (() => void) | undefined;
  viewKeys?: string | undefined;
  look: DiffLook;
  measures: DiffMeasures;
  measuring: DiffMeasuring;
}) {
  const {
    sideBySide,
    wordWrap,
    showWhitespace,
    highlightSyntax,
    highlightOccurrences = false,
    scrolling,
    root,
    language: chosenLanguage,
    wholePaths,
    note,
  } = look;
  const list = useRef<HTMLDivElement>(null);
  const [copy, setCopy] = useState<string>();
  useSelectedCopy(
    list,
    'data-index',
    highlightOccurrences && !findsText,
    setCopy,
    copy,
  );
  const copiesOf = useMemo(() => {
    if (copy === undefined) {
      return undefined;
    }
    const known = new Map<string, readonly FindRange[]>();
    return (text: string) => {
      const kept = known.get(text);
      if (kept !== undefined) {
        return kept;
      }
      const found = copiesIn(text, copy, false);
      known.set(text, found);
      return found;
    };
  }, [copy]);
  const split = showsSideBySide(sideBySide, whole);
  const columns = measures.wrapColumns;
  const { keepWrapColumns } = measuring;
  const {
    table,
    charWidth,
    widths,
    columnsIn,
    dotLook,
    padding,
    scale,
    lineHeight,
    measureText,
    snap,
  } = useDiffText(measures, measuring);
  const dots = showWhitespace ? dotLook : undefined;
  const keptSideways = keptPlace?.sideways ?? unplaced.sideways;
  const setSideways = useCallback(
    (scrolled: number) => onPlace({ sideways: scrolled }),
    [onPlace],
  );
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
  const noted = note !== undefined;
  const rows = useMemo(
    () =>
      table === undefined
        ? waitingRows
        : diffRows(files, toggled, whole, skeleton, sideBySide, noted),
    [files, toggled, whole, skeleton, sideBySide, table, noted],
  );

  useCodeSnap(list, measuring.snapCode, [
    rows,
    split,
    wordWrap,
    charWidth,
    scale,
  ]);
  const wrapping = wordWrap ? columns : undefined;
  const [dragged, setDragged] = useState(false);
  const { observeOffset, offsetSeen, laidOut } =
    useSeenOffsets<HTMLDivElement>();
  const shownRow = useRef(0);
  const heights = rowMeasures(
    rows,
    wordWrap ? (columns ?? unmeasured) : undefined,
    lineHeight,
    scale,
    wordWrap && table !== undefined ? cellWidthsOf(table) : undefined,
    shownRow,
    Boolean(error),
  );
  const rowsNow = useLaterRows((range) =>
    rowsAround(
      range,
      (index) =>
        laidOut.current?.measurementsCache[index]?.size ??
        heights.estimateSize(index),
      rowsRoom(dragged, laidOut.current?.scrollRect?.height ?? 0),
    ),
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => list.current,
    ...heights,
    rangeExtractor: rowsNow,
    observeElementOffset: observeOffset,
  });
  const follower = useRef<RowFollower>(undefined);
  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    const held = new MutationObserver(() =>
      setDragged(
        element.getAttribute(scrollbarHeldAttribute) === 'vertical-thumb',
      ),
    );
    held.observe(element, { attributeFilter: [scrollbarHeldAttribute] });
    return () => held.disconnect();
  }, []);
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
      wordWrap ? 0 : widestColumns(rows, widths.char > 0 ? widths : undefined),
    [rows, wordWrap, widths],
  );
  const {
    held,
    shown,
    dotColumns,
    room,
    placeCode,
    scrolledNow,
    scrollTo,
    glideTo,
    measureSideways,
  } = useSideways(
    list,
    wordWrap,
    keptSideways,
    setSideways,
    charWidth,
    scale,
    scrolling,
    widest,
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
      path={wholePaths?.new ?? row.path}
      root={wholePaths === undefined ? root : undefined}
      oldPath={
        wholePaths === undefined
          ? row.oldPath
          : wholePaths.old === wholePaths.new
            ? undefined
            : wholePaths.old
      }
      open={row.open}
      notes={
        whole
          ? wholeNotes(whole)
          : files[row.file] === undefined
            ? note === undefined
              ? []
              : [note]
            : fileNotes(files[row.file])
      }
      collapsible={row.collapsible}
      onView={viewOf?.(row.file)}
      viewKeys={viewKeys}
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
    copiesOf,
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
      columnsIn={columnsIn}
      dotLook={dots}
      dotColumns={dotColumns}
      placed={placeCode}
    />
  );

  const reveal = useCallback(
    (scrolled: number) => scrollTo(snappedLeft(scrolled, charWidth, Infinity)),
    [scrollTo, charWidth],
  );
  const hiddenMarks = (
    key: string | undefined,
    line: DiffLine,
    area: (shown: Sideways) => TextArea,
    place: (edge: 'left' | 'right') => React.CSSProperties,
  ) => (
    <HiddenChangeMarks
      text={line.text}
      words={changedWords(words, key)}
      kind={line.kind}
      shown={shown}
      area={area}
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
    dotLook: dots,
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
    copiesOf,
    foundKey,
    found,
    showWhitespace,
    dots,
    dotColumns,
    placeCode,
    wrapping,
    lineHeight,
    columnsIn,
    widths,
    reveal,
  ];

  const items = virtualizer.getVirtualItems();
  useLayoutEffect(() => {
    shownRow.current = items[0]?.index ?? 0;
  }, [items]);
  useLayoutEffect(() => {
    if (room !== undefined && scrolledNow() > room) {
      scrollTo(room);
    }
  }, [room, scrolledNow, scrollTo]);
  const drawsRows = items.length > 0;
  useLayoutEffect(measureSideways, [measureSideways, drawsRows, rows]);
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
    room: room ?? 0,
    scrolledNow,
    reveal,
    virtualizer,
    lineHeight,
  });
  const marked = virtualizer.getTotalSize();
  const viewport = virtualizer.scrollRect?.height ?? 0;
  const marks = useDiffMarks({
    rows,
    keys,
    rangesByLine,
    least: leastMark(marked, viewport),
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
    line: lineHeight,
  });
  useKeptPlace({
    list,
    place: placeNow(),
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
    reveal,
    line: lineHeight,
  });

  return (
    <div
      className={`diff-view ${split ? 'side-by-side' : ''} ${whole && !split ? 'whole-file' : ''} ${wordWrap ? 'wrap' : ''} ${showWhitespace ? 'show-whitespace' : ''}`}
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
        '--diff-snap-inline': `${snap.inline}px`,
        '--diff-snap-left': `${snap.left}px`,
        '--diff-snap-right': `${snap.right}px`,
        '--diff-word-padding-top': `${padding.top}px`,
        '--diff-word-padding-bottom': `${padding.bottom}px`,
        '--diff-gap-width': `${gapWidth(scale)}px`,
      }}
    >
      {!wordWrap && (
        <SidewaysBars
          shown={shown}
          held={held}
          sides={split ? 2 : 1}
          list={list}
        />
      )}
      <ScrollbarMarks marks={marks} scale={marksScale(marked, viewport)} />
      <div
        className="virtual-rows"
        ref={list}
        tabIndex={0}
        {...{
          [columnFocusAttribute]: '',
          [shortcutsEntryAttribute]: 'diff',
        }}
        onKeyDown={(event) =>
          diffKeyDown(event, {
            sideways: scrolledNow(),
            room,
            setSideways: glideTo,
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
