import { useMemo, useRef, useState, type RefObject } from 'react';
import {
  deferredChanges,
  type ChangeArea,
  type DiffLayout,
  type FileChange,
  type TextRequest,
} from '../shared/protocol';
import { Column } from './column';
import { parsePatch, type DiffFile } from './diff';
import { DiffView, type WholeFile } from './diffView';
import { findMatches, matchCount, stepMatch, unsearchedFiles } from './find';
import type { ImageOrigin } from './images';
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
import { keymap } from '../shared/keymap';
import { strings } from '../shared/strings';
import { keyPressed, useBinding } from './shortcuts';

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
          placeholder: {
            lines: change.tooLargeToCount
              ? undefined
              : change.insertions + change.deletions,
          },
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
      <span className={`pin-pair ${pinned ? 'pinned' : ''}`}>
        <button
          className={`nav-button toggle ${shown ? 'active' : ''}`}
          title={
            pinned
              ? strings.diff.pinnedEntire
              : entire
                ? strings.diff.showOnlyChanges
                : strings.diff.showEntireFile
          }
          aria-pressed={shown}
          disabled={!canShow || pinned}
          onClick={() => onEntire(!entire)}
        >
          <EntireFileIcon />
        </button>
        <button
          className={`nav-button toggle ${pinned ? 'active' : ''}`}
          title={pinned ? strings.diff.unpinEntire : strings.diff.pinEntire}
          aria-pressed={pinned}
          onClick={() => onPin(!pinned)}
        >
          <PinIcon />
        </button>
      </span>
      <span className="nav-button-space" />
      <button
        className={`nav-button toggle ${ignoreWhitespace ? 'active' : ''}`}
        title={
          ignoreWhitespace
            ? strings.diff.showWhitespace
            : strings.diff.ignoreWhitespace
        }
        aria-pressed={ignoreWhitespace}
        onClick={() => onIgnoreWhitespace(!ignoreWhitespace)}
      >
        <IgnoreWhitespaceIcon />
      </button>
      <button
        className={`nav-button toggle ${wordWrap ? 'active' : ''}`}
        title={wordWrap ? strings.diff.unwrap : strings.diff.wrap}
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
              event.currentTarget.blur();
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
  diffs,
  largeFiles,
  onLoadFile,
  texts,
  onLoadTexts,
  fileContent,
  error,
  options,
  changeMarks,
  sideBySide,
  wordWrap,
  origin,
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
  options: React.ReactNode;
  changeMarks: boolean;
  sideBySide: boolean;
  wordWrap: boolean;
  origin: ImageOrigin | undefined;
}) {
  const parsed = useMemo(() => parsePatch(patch), [patch]);
  const diffFiles = useMemo(
    () =>
      path === undefined ? withLargeFiles(parsed, files, largeFiles) : parsed,
    [parsed, path, files, largeFiles],
  );
  const errorRow = error && <div className="error-message">{error}</div>;

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
  useBinding(keymap.find, () => {
    input.current?.focus();
    input.current?.select();
  });

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
        origin={origin}
        matches={matches}
        current={shown}
        jump={jump}
      />
    </Column>
  );
}
