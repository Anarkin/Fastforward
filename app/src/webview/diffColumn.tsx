import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  deferredChanges,
  type DiffLayout,
  type FileChange,
  type TextRequest,
} from '../shared/protocol';
import { Column } from './column';
import { parsePatch, type DiffFile } from './diff';
import { DiffView, type WholeFile } from './diffView';
import { findMatches, matchCount, stepMatch, unsearchedFiles } from './find';
import {
  EntireFileIcon,
  IgnoreWhitespaceIcon,
  InlineIcon,
  NextIcon,
  PinIcon,
  PreviousIcon,
  SideBySideIcon,
  WordWrapIcon,
} from './icons';
import { isFindShortcut } from './shortcuts';

export function withLargeFiles(
  parsed: readonly DiffFile[],
  files: readonly FileChange[],
  largeFiles: ReadonlyMap<string, DiffFile>,
): DiffFile[] {
  const byPath = new Map(parsed.map((file) => [file.path, file]));
  const deferred = deferredChanges(files);
  const result: DiffFile[] = [];
  for (const change of files) {
    const file = byPath.get(change.path);
    if (file) {
      result.push(file);
      byPath.delete(change.path);
    } else if (deferred.has(change.path)) {
      result.push(
        largeFiles.get(change.path) ?? {
          path: change.path,
          binary: false,
          hunks: [],
          placeholder: { lines: change.insertions + change.deletions },
        },
      );
    }
  }
  return [...result, ...byPath.values()];
}

export function DiffOptions({
  entire,
  pinned,
  canShow,
  ignoreWhitespace,
  wordWrap,
  onEntire,
  onPin,
  onIgnoreWhitespace,
  onWordWrap,
  layout,
  onLayout,
}: {
  entire: boolean;
  pinned: boolean;
  canShow: boolean;
  ignoreWhitespace: boolean;
  wordWrap: boolean;
  onEntire: (entire: boolean) => void;
  onPin: (pinned: boolean) => void;
  onIgnoreWhitespace: (ignore: boolean) => void;
  onWordWrap: (wrap: boolean) => void;
  layout: DiffLayout;
  onLayout: (layout: DiffLayout) => void;
}) {
  const shown = entire || pinned;
  return (
    <div className="nav-buttons diff-options">
      <button
        className={`nav-button toggle ${shown ? 'active' : ''}`}
        title={
          pinned
            ? 'Showing every file entire, as pinned'
            : 'Show the entire file, until you leave it'
        }
        aria-pressed={shown}
        disabled={!canShow || pinned}
        onClick={() => onEntire(!entire)}
      >
        <EntireFileIcon />
      </button>
      <button
        className={`nav-button toggle ${pinned ? 'active' : ''}`}
        title={
          pinned
            ? 'Unpin: show only the changes again'
            : 'Pin: always show entire files'
        }
        aria-pressed={pinned}
        onClick={() => onPin(!pinned)}
      >
        <PinIcon />
      </button>
      <span className="nav-button-space" />
      <button
        className={`nav-button toggle ${ignoreWhitespace ? 'active' : ''}`}
        title={
          ignoreWhitespace
            ? 'Ignoring whitespace: show changes to it again'
            : 'Ignore Whitespace'
        }
        aria-pressed={ignoreWhitespace}
        onClick={() => onIgnoreWhitespace(!ignoreWhitespace)}
      >
        <IgnoreWhitespaceIcon />
      </button>
      <button
        className={`nav-button toggle ${wordWrap ? 'active' : ''}`}
        title={
          wordWrap
            ? 'Wrapping long lines: show them unwrapped again'
            : 'Word Wrap'
        }
        aria-pressed={wordWrap}
        onClick={() => onWordWrap(!wordWrap)}
      >
        <WordWrapIcon />
      </button>
      <span className="nav-button-space" />
      <button
        className={`nav-button toggle ${layout === 'inline' ? 'active' : ''}`}
        title="Inline"
        aria-pressed={layout === 'inline'}
        onClick={() => onLayout('inline')}
      >
        <InlineIcon />
      </button>
      <button
        className={`nav-button toggle ${layout === 'sideBySide' ? 'active' : ''}`}
        title="Side by Side"
        aria-pressed={layout === 'sideBySide'}
        onClick={() => onLayout('sideBySide')}
      >
        <SideBySideIcon />
      </button>
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
        placeholder="Search…"
        spellCheck={false}
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onStep(event.shiftKey ? -1 : 1);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            if (query) {
              onQuery('');
            } else {
              event.currentTarget.blur();
            }
          }
        }}
      />
      {count && (
        <span
          className="diff-find-count"
          title={
            unsearched > 0
              ? `Large files not shown yet are not searched: ${unsearched}`
              : undefined
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
        title="Previous Match (Shift+Enter)"
        disabled={matches === 0}
        onClick={() => onStep(-1)}
      >
        <PreviousIcon />
      </button>
      <button
        className="nav-button"
        title="Next Match (Enter)"
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
): string {
  return JSON.stringify([root, hash, path]);
}

export function Diff({
  selection,
  path,
  loading,
  files,
  patch,
  diffs,
  largeFiles,
  onLoadFile,
  texts,
  onLoadTexts,
  fileContent,
  error,
  entireFile,
  changeMarks,
  sideBySide = false,
  wordWrap = false,
}: {
  selection: string;
  path: string | undefined;
  loading: boolean;
  files: readonly FileChange[];
  patch: string;
  diffs: number;
  largeFiles: ReadonlyMap<string, DiffFile>;
  onLoadFile: (path: string) => void;
  texts: ReadonlyMap<string, string>;
  onLoadTexts: (texts: TextRequest[]) => void;
  fileContent: WholeFile | undefined;
  error: string | undefined;
  entireFile: React.ReactNode;
  changeMarks: boolean;
  sideBySide?: boolean;
  wordWrap?: boolean;
}) {
  const parsed = useMemo(() => parsePatch(patch), [patch]);
  const diffFiles = useMemo(
    () =>
      path === undefined ? withLargeFiles(parsed, files, largeFiles) : parsed,
    [parsed, path, files, largeFiles],
  );
  const errorRow = error && <div className="error">{error}</div>;

  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const [jump, setJump] = useState(0);
  const input = useRef<HTMLInputElement>(null);
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
  const [seen, setSeen] = useState(selection);
  if (seen !== selection) {
    setSeen(selection);
    setCurrent(0);
    setJump((count) => count + 1);
  }
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isFindShortcut(event)) {
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    }
  });
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
      start={entireFile}
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
        matches={matches}
        current={shown}
        jump={jump}
      />
    </Column>
  );
}
