import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { FileChange } from '../../../lib/shared/changes';
import type { LeftOut, TextRequest } from '../shared/protocol';
import { Column } from '../../../lib/page/column';
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
import type { Sentence } from '../../../lib/shared/sentences';
import { Words } from '../../../lib/page/name';
import type { WholeFile } from './rows';
import { DiffView } from './view';
import { shownFiles, filteredDiffFiles } from './files';
import { useDiffFind, type DiffTab, type LinePlace } from './finding';
import { DiffFindBar } from './findBar';
import { ColumnStatus } from '../../../lib/page/columnStatusLine';
import { linesCounted } from './lineCounts';
import type { DiffLook } from './look';
import type { DiffMeasures, DiffMeasuring } from './measures';
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
  readonly entire: boolean;
  readonly origin: ImageOrigin | undefined;
  readonly findAsked: number;
  readonly filter: Search | undefined;
  readonly heading?: React.ReactNode;
  readonly onViewFile?: (source: ViewedSource) => void;
  readonly viewAsked?: number;
  readonly look: DiffLook;
  readonly measures: DiffMeasures;
  readonly measuring: DiffMeasuring;
  readonly tab: DiffTab;
  readonly tabSizeOfPath?: ((path: string) => number | undefined) | undefined;
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
  entire,
  origin,
  findAsked,
  filter,
  heading,
  onViewFile,
  viewAsked = 0,
  look,
  measures,
  measuring,
  tab,
  tabSizeOfPath,
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
      ) : undefined,
    [error],
  );

  const viewShown = useEffectEvent(() => {
    const file = diffFiles.at(0);
    const source =
      path === undefined || origin === undefined
        ? undefined
        : fileContent === undefined
          ? file && viewedSource(origin, file)
          : wholeViewedSource(origin, fileContent);
    if (source !== undefined) {
      onViewFile?.(source);
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
  const topLine = useRef<() => LinePlace | undefined>(undefined);
  const find = useDiffFind({
    shownAt,
    tab,
    diffFiles,
    fileContent,
    findAsked,
    topLine,
  });
  const { jump, matches, shown, finding } = find;
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
      title={heading}
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
        key={shownAt}
        keptPlace={tab.place}
        placeNow={tab.placeNow}
        topLine={topLine}
        onPlace={tab.keepPlace}
        error={errorRow}
        files={diffFiles}
        whole={fileContent}
        loading={loading}
        diff={diffs}
        onLoad={onLoadFile}
        texts={texts}
        onLoadTexts={onLoadTexts}
        origin={origin}
        matches={matches}
        findsText={find.query !== ''}
        current={shown}
        jump={jump}
        firstChange={path === undefined ? undefined : firstChange}
        look={look}
        measures={measures}
        measuring={measuring}
        tabSizeOfPath={tabSizeOfPath}
      />
    </Column>
  );
}
