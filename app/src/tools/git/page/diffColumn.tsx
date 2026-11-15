import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FileChange, LeftOut, TextRequest } from '../shared/protocol';
import { Column } from './column';
import { parsePatch, type DiffFile } from './diff';
import type { LoadedText } from './sideTexts';
import { unsearchedFiles } from './find';
import { matchCount } from '../../../lib/shared/textMatches';
import { searchFilter } from '../../../lib/shared/filter';
import { plainSearch } from '../../../lib/shared/searchOptions';
import { withUnchangedObjects, type ImageOrigin } from './images';
import {
  viewedSource,
  wholeViewedSource,
  type ViewedSource,
} from './viewedSource';
import { gitKeymap } from './keymap';
import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
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
import { useDiffFind } from './diffFind';

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
          searchFilter(filter ?? '', plainSearch),
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
  const {
    query,
    setQuery,
    setCurrent,
    jump,
    setJump,
    input,
    matches,
    shown,
    goTo,
    step,
    finding,
    openFind,
    closeFind,
  } = useDiffFind({ diffFiles, fileContent, findAsked });
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

  return (
    <Column
      start={options}
      search={<SearchButton title={strings.find.title} onClick={openFind} />}
      searching={
        finding && (
          <SearchRow onClose={closeFind}>
            <FindField
              query={query}
              count={matchCount(query, plainSearch, {
                current: shown,
                matches: matches.length,
              })}
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
