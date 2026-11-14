import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FileChange, LeftOut, TextRequest } from '../shared/protocol';
import { columnFocusOf } from '../../../lib/page/columnFocus';
import { Column } from './column';
import { useShell, useShellActions } from '../../../shell/page/store';
import { languageKeyOf, pickedFor, useGit, useGitActions } from './store';
import { languageChoiceOf } from '../../../lib/page/languageMenu';
import { LanguageButton } from '../../../lib/page/languageChoice';
import { languageOf } from '../../../lib/page/languages';
import { useBinding } from '../../../lib/page/shortcuts';
import { parsePatch, type DiffFile, type LoadedText } from './diff';
import { findMatches, unsearchedFiles } from './find';
import { matchCount, stepMatch } from '../../../lib/shared/textMatches';
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
  SideBySideIcon,
  WordWrapIcon,
} from '../../../lib/page/icons';
import { gitKeymap } from './keymap';
import { strings, type Sentence } from '../../../lib/shared/strings';
import { Words } from '../../../lib/page/name';
import {
  FindActions,
  FindField,
  SearchButton,
  SearchRow,
} from '../../../lib/page/search';
import type { WholeFile } from './diffRows';
import { DiffView } from './diffView';
import { shownFiles, filteredDiffFiles } from './diffFiles';

export function DiffLanguage({ comparing }: { comparing: string | undefined }) {
  const key = useGit((state) => languageKeyOf(comparing, state.tab));
  const path = useGit((state) => state.tab.path);
  const compared = useGit(({ compare }) =>
    compare !== undefined && compare.tab === comparing
      ? compare.new
      : undefined,
  );
  const picked = useGit(pickedFor(key));
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const { changeTextView } = useShellActions();
  const { pickLanguage, seeLanguageKey } = useGitActions();
  useEffect(() => seeLanguageKey(key), [key, seeLanguageKey]);
  const { choice, choose } = languageChoiceOf(
    key,
    {
      on: highlightSyntax,
      change: (on) => changeTextView({ highlightSyntax: on }),
    },
    { language: picked, keep: (language) => pickLanguage(key, language) },
  );
  const trigger = useRef<HTMLButtonElement>(null);
  useBinding(gitKeymap.language, () => trigger.current?.click());
  const shown = comparing === undefined ? path : compared;
  return (
    <LanguageButton
      choice={choice}
      detected={shown && languageOf(shown)}
      single={key !== undefined}
      choose={choose}
      trigger={trigger}
    />
  );
}

export function DiffOptions({ language }: { language: React.ReactNode }) {
  const entire = useGit((state) => state.showEntireFile);
  const ignoreWhitespace = useGit((state) => state.ignoreWhitespace);
  const layout = useGit((state) => state.diffLayout);
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const {
    changeShowEntireFile: onEntire,
    changeIgnoreWhitespace: onIgnoreWhitespace,
    changeDiffLayout: onLayout,
  } = useGitActions();
  const { changeTextView } = useShellActions();
  const onShowWhitespace = (show: boolean) =>
    changeTextView({ showWhitespace: show });
  const onWordWrap = (wrap: boolean) => changeTextView({ wordWrap: wrap });
  return (
    <div className="nav-buttons diff-options">
      <button
        className={`nav-button toggle ${entire ? 'active' : ''}`}
        title={strings.diff.showEntireFile}
        aria-pressed={entire}
        onClick={() => onEntire(!entire)}
      >
        <EntireFileIcon />
      </button>
      <span className="nav-button-space" />
      {language}
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
  origin,
  findAsked,
  filter,
  note,
  onViewFile,
  viewAsked = 0,
  languageKey,
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
  error: Sentence | undefined;
  options: React.ReactNode;
  changeMarks: boolean;
  entire: boolean;
  origin: ImageOrigin | undefined;
  findAsked: number;
  filter: string | undefined;
  note?: string;
  onViewFile?: (source: ViewedSource) => void;
  viewAsked?: number;
  languageKey?: string;
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
  const errorRow = useMemo(
    () =>
      error ? (
        <div className="error-message">
          <Words>{error}</Words>
        </div>
      ) : (
        note && <div className="diff-note">{note}</div>
      ),
    [error, note],
  );

  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  const [jump, setJump] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const viewOf = useCallback(
    (index: number) => {
      const view = onViewFile;
      const file = diffFiles.at(index);
      const source =
        origin === undefined || view === undefined
          ? undefined
          : fileContent === undefined
            ? file && viewedSource(origin, file)
            : wholeViewedSource(origin, fileContent);
      return source && view && (() => view(source));
    },
    [onViewFile, diffFiles, origin, fileContent],
  );
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
        finding={finding}
        origin={origin}
        matches={matches}
        current={shown}
        jump={jump}
        firstChange={path === undefined ? undefined : firstChange}
        languageKey={languageKey}
      />
    </Column>
  );
}
