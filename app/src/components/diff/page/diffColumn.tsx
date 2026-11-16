import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FileChange } from '../../../lib/shared/changes';
import type { LeftOut, TextRequest } from '../shared/diffProtocol';
import { Column } from '../../../lib/page/column';
import { parsePatch, type DiffFile } from './diff';
import type { LoadedText } from './sideTexts';
import { unsearchedFiles } from './find';
import { searchFilter } from '../../../lib/shared/filter';
import { plainSearch, type Search } from '../../../lib/shared/searchOptions';
import { withUnchangedObjects, type ImageOrigin } from './diffImages';
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
import { useDiffFind, type DiffTab } from './diffFind';
import { DiffFindBar } from './diffFindBar';
import { ColumnStatus } from '../../../lib/page/columnStatusLine';
import { linesCounted } from './lineCounts';
import type { DiffLook } from './diffLook';
import type { DiffMeasures, DiffMeasuring } from './diffMeasures';
import './style.css';

export interface DiffProps {
  readonly scope: string;
  readonly selection: string;
  readonly path: string | undefined;
  readonly loading: boolean;
  readonly files: readonly FileChange[];
  readonly patch: string;
  readonly leftOut: readonly LeftOut[];
  readonly whitespaceOnly: readonly string[];
  readonly diffs: number;
  readonly largeFiles: ReadonlyMap<string, DiffFile>;
  readonly onLoadFile: (path: string) => void;
  readonly texts: ReadonlyMap<string, LoadedText>;
  readonly onLoadTexts: (texts: TextRequest[]) => void;
  readonly fileContent: WholeFile | undefined;
  readonly error: Sentence | undefined;
  readonly options: React.ReactNode;
  readonly changeMarks: boolean;
  readonly entire: boolean;
  readonly origin: ImageOrigin | undefined;
  readonly findAsked: number;
  readonly filter: Search | undefined;
  readonly note?: string;
  readonly onViewFile?: (source: ViewedSource) => void;
  readonly viewAsked?: number;
  readonly look: DiffLook;
  readonly measures: DiffMeasures;
  readonly measuring: DiffMeasuring;
  readonly tab: DiffTab;
}

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
  look,
  measures,
  measuring,
  tab,
}: DiffProps) {
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
  const shownAt = JSON.stringify([scope, selection]);
  const find = useDiffFind({
    shownAt,
    tab,
    diffFiles,
    fileContent,
    findAsked,
  });
  const { jump, matches, shown, finding, openFind } = find;
  const [firstChange, setFirstChange] = useState(0);
  const [entireSeen, setEntireSeen] = useState(entire);
  const [awaitedDiff, setAwaitedDiff] = useState<number>();
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
        keptPlace={tab.place}
        onPlace={tab.keepPlace}
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
        look={look}
        measures={measures}
        measuring={measuring}
      />
    </Column>
  );
}
