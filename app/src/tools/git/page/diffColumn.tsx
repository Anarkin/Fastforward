import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  type ChangeArea,
  type DiffLayout,
  type FileChange,
  type LeftOut,
  type TextRequest,
} from '../shared/protocol';
import { columnFocusOf } from '../../../ui/columnFocus';
import { Column } from './column';
import { parsePatch, type DiffFile, type LoadedText } from './diff';
import { DiffView, type WholeFile } from './diffView';
import { filterWords, matchesFilter } from '../../../shared/fileFilter';
import { findMatches, unsearchedFiles } from './find';
import { matchCount, stepMatch } from '../../../shared/textMatches';
import {
  viewedSource,
  wholeViewedSource,
  withUnchangedObjects,
  type ImageOrigin,
  type ViewedSource,
} from './images';
import {
  EntireFileIcon,
  WhitespaceChangesIcon,
  ShowWhitespaceIcon,
  InlineIcon,
  PinIcon,
  SideBySideIcon,
  SyntaxIcon,
  WordWrapIcon,
} from '../../../ui/icons';
import { gitKeymap } from '../shared/keymap';
import { strings } from '../../../shared/strings';
import {
  FindActions,
  FindField,
  SearchButton,
  SearchRow,
} from '../../../ui/search';

export function withLargeFiles(
  parsed: readonly DiffFile[],
  files: readonly FileChange[],
  leftOut: readonly LeftOut[],
  largeFiles: ReadonlyMap<string, DiffFile>,
  whitespaceOnly: ReadonlySet<string> = new Set(),
): DiffFile[] {
  const byPath = new Map(parsed.map((file) => [file.path, file]));
  const deferred = new Map(leftOut.map(({ path, lines }) => [path, lines]));
  const result: DiffFile[] = [];
  for (const change of files) {
    const file = byPath.get(change.path);
    byPath.delete(change.path);
    if (file && !deferred.has(change.path)) {
      result.push(file);
    } else if (deferred.has(change.path)) {
      result.push(deferredFile(change, deferred.get(change.path), largeFiles));
    } else if (whitespaceOnly.has(change.path)) {
      result.push(whitespaceOnlyFile(change.path));
    }
  }
  return [...result, ...byPath.values()];
}

function deferredFile(
  { path, oldPath }: Pick<FileChange, 'path' | 'oldPath'>,
  lines: number | undefined,
  largeFiles: ReadonlyMap<string, DiffFile>,
): DiffFile {
  return (
    largeFiles.get(path) ?? {
      path,
      ...(oldPath === undefined ? {} : { oldPath }),
      binary: false,
      hunks: [],
      placeholder: { lines },
    }
  );
}

function whitespaceOnlyFile(path: string): DiffFile {
  return { path, binary: false, hunks: [], whitespaceOnly: true };
}

export function shownFiles(
  parsed: readonly DiffFile[],
  path: string | undefined,
  files: readonly FileChange[],
  leftOut: readonly LeftOut[],
  largeFiles: ReadonlyMap<string, DiffFile>,
  whitespaceOnly: readonly string[] = [],
): DiffFile[] {
  if (path === undefined) {
    return withLargeFiles(
      parsed,
      files,
      leftOut,
      largeFiles,
      new Set(whitespaceOnly),
    );
  }
  const deferred = leftOut.find((file) => file.path === path);
  if (deferred) {
    return [
      deferredFile(
        files.find((file) => file.path === path) ?? {
          path,
          oldPath: undefined,
        },
        deferred.lines,
        largeFiles,
      ),
    ];
  }
  const shown = parsed.filter((file) => file.path === path);
  if (!whitespaceOnly.includes(path)) {
    return shown;
  }
  return shown.length === 0
    ? [whitespaceOnlyFile(path)]
    : shown.map((file) => ({ ...file, whitespaceOnly: true }));
}

export function filteredDiffFiles(
  files: readonly DiffFile[],
  path: string | undefined,
  filter: string | undefined,
): readonly DiffFile[] {
  const words = filterWords(filter ?? '');
  return path !== undefined || words.length === 0
    ? files
    : files.filter((file) => matchesFilter(words, file.path, file.oldPath));
}

export function DiffOptions({
  entire,
  pinned,
  canShow,
  showWhitespace,
  ignoreWhitespace,
  wordWrap,
  onEntire,
  onPin,
  onShowWhitespace,
  onIgnoreWhitespace,
  onWordWrap,
  highlightSyntax,
  onHighlightSyntax,
  layout,
  onLayout,
}: {
  entire: boolean;
  pinned: boolean;
  canShow: boolean;
  showWhitespace: boolean;
  ignoreWhitespace: boolean;
  wordWrap: boolean;
  onEntire: (entire: boolean) => void;
  onPin: (pinned: boolean) => void;
  onShowWhitespace: (show: boolean) => void;
  onIgnoreWhitespace: (ignore: boolean) => void;
  onWordWrap: (wrap: boolean) => void;
  highlightSyntax: boolean;
  onHighlightSyntax: (highlight: boolean) => void;
  layout: DiffLayout;
  onLayout: (layout: DiffLayout) => void;
}) {
  const shown = entire || pinned;
  return (
    <div className="nav-buttons diff-options">
      <span className={`pin-pair ${pinned ? 'pinned' : ''}`}>
        <button
          className={`nav-button toggle ${shown ? 'active' : ''}`}
          title={strings.diff.showEntireFile}
          aria-pressed={shown}
          disabled={!canShow || pinned}
          onClick={() => onEntire(!entire)}
        >
          <EntireFileIcon />
        </button>
        <button
          className={`nav-button toggle ${pinned ? 'active' : ''}`}
          title={strings.diff.pinEntire}
          aria-pressed={pinned}
          onClick={() => onPin(!pinned)}
        >
          <PinIcon />
        </button>
      </span>
      <span className="nav-button-space" />
      <button
        className={`nav-button toggle ${showWhitespace ? 'active' : ''}`}
        title={strings.common.showWhitespace}
        aria-pressed={showWhitespace}
        onClick={() => onShowWhitespace(!showWhitespace)}
      >
        <ShowWhitespaceIcon />
      </button>
      <button
        className={`nav-button toggle ${ignoreWhitespace ? '' : 'active'}`}
        title={strings.diff.showWhitespaceChanges}
        aria-pressed={!ignoreWhitespace}
        onClick={() => onIgnoreWhitespace(!ignoreWhitespace)}
      >
        <WhitespaceChangesIcon />
      </button>
      <span className="nav-button-space" />
      <button
        className={`nav-button toggle ${wordWrap ? 'active' : ''}`}
        title={strings.common.wrap}
        aria-pressed={wordWrap}
        onClick={() => onWordWrap(!wordWrap)}
      >
        <WordWrapIcon />
      </button>
      <button
        className={`nav-button toggle ${highlightSyntax ? 'active' : ''}`}
        title={strings.common.highlightSyntax}
        aria-pressed={highlightSyntax}
        onClick={() => onHighlightSyntax(!highlightSyntax)}
      >
        <SyntaxIcon />
      </button>
      <span className="nav-button-space" />
      <div className="segmented" role="group" aria-label={strings.diff.layout}>
        <button
          className={`nav-button toggle ${layout === 'inline' ? 'active' : ''}`}
          title={strings.diff.inline}
          aria-pressed={layout === 'inline'}
          onClick={() => onLayout('inline')}
        >
          <InlineIcon />
        </button>
        <button
          className={`nav-button toggle ${layout === 'sideBySide' ? 'active' : ''}`}
          title={strings.diff.sideBySide}
          aria-pressed={layout === 'sideBySide'}
          onClick={() => onLayout('sideBySide')}
        >
          <SideBySideIcon />
        </button>
      </div>
    </div>
  );
}

export function diffSelection(
  root: string | undefined,
  hash: string | undefined,
  path: string | undefined,
  area?: ChangeArea,
): string {
  return JSON.stringify([root, hash, path, area]);
}

export function Diff({
  selection,
  path,
  loading,
  files,
  patch,
  leftOut,
  whitespaceOnly,
  diffs,
  largeFiles,
  onLoadFile,
  texts,
  onLoadTexts,
  fileContent,
  error,
  options,
  changeMarks,
  entire,
  sideBySide,
  wordWrap,
  showWhitespace,
  origin,
  findAsked,
  filter,
  note,
  onViewFile,
  viewAsked = 0,
}: {
  selection: string;
  path: string | undefined;
  loading: boolean;
  files: readonly FileChange[];
  patch: string;
  leftOut: readonly LeftOut[];
  whitespaceOnly: readonly string[];
  diffs: number;
  largeFiles: ReadonlyMap<string, DiffFile>;
  onLoadFile: (path: string) => void;
  texts: ReadonlyMap<string, LoadedText>;
  onLoadTexts: (texts: TextRequest[]) => void;
  fileContent: WholeFile | undefined;
  error: string | undefined;
  options: React.ReactNode;
  changeMarks: boolean;
  entire: boolean;
  sideBySide: boolean;
  wordWrap: boolean;
  showWhitespace: boolean;
  origin: ImageOrigin | undefined;
  findAsked: number;
  filter: string | undefined;
  note?: string;
  onViewFile?: (source: ViewedSource) => void;
  viewAsked?: number;
}) {
  const parsed = useMemo(() => parsePatch(patch), [patch]);
  const diffFiles = useMemo(
    () =>
      withUnchangedObjects(
        filteredDiffFiles(
          shownFiles(parsed, path, files, leftOut, largeFiles, whitespaceOnly),
          path,
          filter,
        ),
        files,
      ),
    [parsed, path, files, leftOut, largeFiles, whitespaceOnly, filter],
  );
  const errorRow = error ? (
    <div className="error-message">{error}</div>
  ) : (
    note && <div className="diff-note">{note}</div>
  );

  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const [jump, setJump] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const viewOf = (index: number) => {
    const view = onViewFile;
    const file = diffFiles.at(index);
    const source =
      origin === undefined || view === undefined
        ? undefined
        : fileContent === undefined
          ? file && viewedSource(origin, file)
          : wholeViewedSource(origin, fileContent);
    return source && view && (() => view(source));
  };
  const viewShown = useEffectEvent(() => {
    if (path !== undefined) {
      viewOf(0)?.();
    }
  });
  const viewSeen = useRef(viewAsked);
  useEffect(() => {
    if (viewSeen.current !== viewAsked) {
      viewSeen.current = viewAsked;
      viewShown();
    }
  }, [viewAsked]);
  const matches = useMemo(
    () => findMatches(diffFiles, fileContent, query),
    [diffFiles, fileContent, query],
  );
  const shown = Math.min(current, Math.max(0, matches.length - 1));
  const goTo = (index: number) => {
    setCurrent(index);
    setJump((count) => count + 1);
  };
  const step = (by: 1 | -1) => goTo(stepMatch(shown, matches.length, by));
  const [firstChange, setFirstChange] = useState(0);
  const [entireSeen, setEntireSeen] = useState(entire);
  const [awaitedDiff, setAwaitedDiff] = useState<number>();
  const [seen, setSeen] = useState(selection);
  if (seen !== selection) {
    setSeen(selection);
    setCurrent(0);
    setJump((count) => count + 1);
    setEntireSeen(entire);
    setAwaitedDiff(undefined);
  } else if (entireSeen !== entire) {
    setEntireSeen(entire);
    setAwaitedDiff(diffs);
  } else if (awaitedDiff !== undefined && diffs > awaitedDiff) {
    setAwaitedDiff(undefined);
    setFirstChange((count) => count + 1);
  }
  const [finding, setFinding] = useState(false);
  const [focusAsks, setFocusAsks] = useState(0);
  const openFind = () => {
    setFinding(true);
    setFocusAsks((count) => count + 1);
  };
  const closeFind = () => {
    columnFocusOf(input.current)?.focus();
    setFinding(false);
    setQuery('');
  };
  const [findSeen, setFindSeen] = useState(findAsked);
  if (findSeen !== findAsked) {
    setFindSeen(findAsked);
    openFind();
  }
  useEffect(() => {
    if (focusAsks > 0) {
      input.current?.focus();
      input.current?.select();
    }
  }, [focusAsks]);

  return (
    <Column
      start={options}
      search={<SearchButton title={strings.find.title} onClick={openFind} />}
      searching={
        finding && (
          <SearchRow onClose={closeFind}>
            <FindField
              query={query}
              count={matchCount(query, matches.length, shown)}
              countTitle={
                unsearchedFiles(diffFiles, fileContent) > 0
                  ? strings.find.unsearched(
                      unsearchedFiles(diffFiles, fileContent),
                    )
                  : undefined
              }
              keys={gitKeymap}
              input={input}
              onQuery={(next) => {
                setQuery(next);
                goTo(0);
              }}
              onStep={step}
              onClose={closeFind}
            />
            <FindActions matches={matches.length} onStep={step} />
          </SearchRow>
        )
      }
    >
      <DiffView
        viewOf={viewOf}
        key={selection}
        error={errorRow}
        files={diffFiles}
        whole={fileContent}
        loading={loading}
        diff={diffs}
        onLoad={onLoadFile}
        texts={texts}
        onLoadTexts={onLoadTexts}
        changeMarks={changeMarks}
        sideBySide={sideBySide}
        wordWrap={wordWrap}
        showWhitespace={showWhitespace}
        origin={origin}
        matches={matches}
        current={shown}
        jump={jump}
        firstChange={path === undefined ? undefined : firstChange}
      />
    </Column>
  );
}
