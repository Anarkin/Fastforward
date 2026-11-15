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
import { searchFilter } from '../../../lib/shared/filter';
import { plainSearch, type Search } from '../../../lib/shared/searchOptions';
import { withUnchangedObjects, type ImageOrigin } from './images';
import {
  viewedSource,
  wholeViewedSource,
  type ViewedSource,
} from './viewedSource';
import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import { Words } from '../../../lib/page/name';
import { SearchButton } from '../../../lib/page/search';
import type { WholeFile } from './diffRows';
import { DiffView } from './diffView';
import { shownFiles, filteredDiffFiles } from './diffFiles';
import { useDiffFind } from './diffFind';
import { DiffFindBar } from './diffFindBar';
import { ColumnStatus } from './columnStatusLine';
import { linesCounted } from './columnStatus';
import { useGitActions } from './store';
import type { DiffPlace } from './diffPlace';

export function Diff({
  scope,
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
  scope: string;
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
  filter: Search | undefined;
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
          searchFilter(filter?.query ?? '', filter?.options ?? plainSearch),
        ),
        files,
      ),
    [parsed, path, files, leftOut, largeFiles, whitespaceOnly, filter],
  );
  const lines = useMemo(
    () => linesCounted(diffFiles, files),
    [diffFiles, files],
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
  const find = useDiffFind({
    scope,
    selection,
    diffFiles,
    fileContent,
    findAsked,
  });
  const { jump, matches, shown, finding, openFind } = find;
  const { diffPlaceOf, keepDiffPlace } = useGitActions();
  const keepPlace = useCallback(
    (change: Partial<DiffPlace>) => keepDiffPlace(scope, selection, change),
    [keepDiffPlace, scope, selection],
  );
  const [firstChange, setFirstChange] = useState(0);
  const [entireSeen, setEntireSeen] = useState(entire);
  const [awaitedDiff, setAwaitedDiff] = useState<number>();
  const shownAt = JSON.stringify([scope, selection]);
  const [seen, setSeen] = useState(shownAt);
  if (seen !== shownAt) {
    setSeen(shownAt);
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
      focusName="diff"
      start={options}
      search={<SearchButton title={strings.find.title} onClick={openFind} />}
      status={
        <ColumnStatus loading={loading} font="monospace">
          {lines}
        </ColumnStatus>
      }
      searching={
        finding && (
          <DiffFindBar
            find={find}
            unsearched={unsearchedFiles(diffFiles, fileContent)}
          />
        )
      }
    >
      <DiffView
        viewOf={viewOf}
        key={shownAt}
        keptPlace={diffPlaceOf(scope, selection)}
        onPlace={keepPlace}
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
