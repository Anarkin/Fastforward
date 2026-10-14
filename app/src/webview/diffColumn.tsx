import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  type ChangeArea,
  type DiffLayout,
  type FileChange,
  type LeftOut,
  type TextRequest,
} from '../shared/protocol';
import { columnFocusOf } from './activeColumn';
import { Column } from './column';
import { parsePatch, type DiffFile } from './diff';
import { DiffView, type WholeFile } from './diffView';
import { findMatches, matchCount, stepMatch, unsearchedFiles } from './find';
import { withUnchangedObjects, type ImageOrigin } from './images';
import {
  EntireFileIcon,
  WhitespaceChangesIcon,
  ShowWhitespaceIcon,
  InlineIcon,
  NextIcon,
  PinIcon,
  PreviousIcon,
  SideBySideIcon,
  WordWrapIcon,
} from './icons';
import { keymap } from '../shared/keymap';
import { strings } from '../shared/strings';
import { keyPressed } from './shortcuts';

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
      result.push(
        deferredFile(change.path, deferred.get(change.path), largeFiles),
      );
    } else if (whitespaceOnly.has(change.path)) {
      result.push(whitespaceOnlyFile(change.path));
    }
  }
  return [...result, ...byPath.values()];
}

function deferredFile(
  path: string,
  lines: number | undefined,
  largeFiles: ReadonlyMap<string, DiffFile>,
): DiffFile {
  return (
    largeFiles.get(path) ?? {
      path,
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
    return [deferredFile(path, deferred.lines, largeFiles)];
  }
  const shown = parsed.filter((file) => file.path === path);
  if (!whitespaceOnly.includes(path)) {
    return shown;
  }
  return shown.length === 0
    ? [whitespaceOnlyFile(path)]
    : shown.map((file) => ({ ...file, whitespaceOnly: true }));
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
        title={strings.diff.showWhitespace}
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
        title={strings.diff.wrap}
        aria-pressed={wordWrap}
        onClick={() => onWordWrap(!wordWrap)}
      >
        <WordWrapIcon />
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

export function DiffFind({
  query,
  count,
  unsearched,
  input,
  onQuery,
  onStep,
}: {
  query: string;
  count: string;
  unsearched: number;
  input?: RefObject<HTMLInputElement | null>;
  onQuery: (query: string) => void;
  onStep: (step: 1 | -1) => void;
}) {
  return (
    <div className={`diff-find ${query ? 'active' : ''}`}>
      <input
        ref={input}
        className="diff-find-input"
        placeholder={strings.find.placeholder}
        spellCheck={false}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          const step = keyPressed(keymap.match, event);
          if (step !== undefined) {
            event.preventDefault();
            onStep(step);
          } else if (keyPressed(keymap.stopFinding, event)) {
            event.preventDefault();
            if (query) {
              onQuery('');
            } else {
              columnFocusOf(event.currentTarget)?.focus();
            }
          }
        }}
      />
      {count && (
        <span
          className="diff-find-count"
          title={
            unsearched > 0 ? strings.find.unsearched(unsearched) : undefined
          }
        >
          {count}
        </span>
      )}
    </div>
  );
}

export function FindActions({
  matches,
  onStep,
}: {
  matches: number;
  onStep: (step: 1 | -1) => void;
}) {
  return (
    <div className="nav-buttons diff-find-actions">
      <button
        className="nav-button"
        title={strings.find.previous}
        disabled={matches === 0}
        onClick={() => onStep(-1)}
      >
        <PreviousIcon />
      </button>
      <button
        className="nav-button"
        title={strings.find.next}
        disabled={matches === 0}
        onClick={() => onStep(1)}
      >
        <NextIcon />
      </button>
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
  texts: ReadonlyMap<string, string>;
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
}) {
  const parsed = useMemo(() => parsePatch(patch), [patch]);
  const diffFiles = useMemo(
    () =>
      withUnchangedObjects(
        shownFiles(parsed, path, files, leftOut, largeFiles, whitespaceOnly),
        files,
      ),
    [parsed, path, files, leftOut, largeFiles, whitespaceOnly],
  );
  const errorRow = error && <div className="error-message">{error}</div>;

  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const [jump, setJump] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [rendered, setRendered] = useState<ReadonlySet<string>>(new Set());
  const render = useCallback((file: string, shown: boolean) => {
    setRendered((all) => {
      const next = new Set(all);
      if (shown) {
        next.add(file);
      } else {
        next.delete(file);
      }
      return next;
    });
  }, []);
  const matches = useMemo(
    () => findMatches(diffFiles, fileContent, query, rendered),
    [diffFiles, fileContent, query, rendered],
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
    setRendered(new Set());
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
  const findSeen = useRef(findAsked);
  useEffect(() => {
    if (findSeen.current !== findAsked) {
      findSeen.current = findAsked;
      input.current?.focus();
      input.current?.select();
    }
  }, [findAsked]);

  return (
    <Column
      title={
        <DiffFind
          query={query}
          count={matchCount(query, matches.length, shown)}
          unsearched={unsearchedFiles(diffFiles, fileContent)}
          input={input}
          onQuery={(next) => {
            setQuery(next);
            goTo(0);
          }}
          onStep={step}
        />
      }
      start={options}
      actions={<FindActions matches={matches.length} onStep={step} />}
    >
      <DiffView
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
        rendered={rendered}
        onRender={render}
      />
    </Column>
  );
}
