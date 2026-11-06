import { useEffect, useRef } from 'react';
import type {
  CompareView as Compared,
  FileChange,
  LeftOut,
} from '../shared/protocol';
import { strings } from '../../../shared/strings';
import type { DiffFile, LoadedText } from './diff';
import { Diff, DiffOptions } from './diffColumn';
import { compareLanguageKey, useGit, useGitActions } from './store';

const noFiles: readonly FileChange[] = [];
const noLeftOut: readonly LeftOut[] = [];
const noPaths: readonly string[] = [];
const noLargeFiles: ReadonlyMap<string, DiffFile> = new Map();
const noTexts: ReadonlyMap<string, LoadedText> = new Map();
const ignored = () => undefined;

function noteOf(compare: Compared | undefined): string | undefined {
  if (compare?.same === 'identical') {
    return strings.diff.filesIdentical;
  }
  return compare?.same === 'whitespace'
    ? strings.diff.filesDifferInWhitespace
    : undefined;
}

export function CompareView({
  comparing,
  findAsked,
  language,
}: {
  comparing: string;
  findAsked: number;
  language: React.ReactNode;
}) {
  const compare = useGit((state) =>
    state.compare?.tab === comparing ? state.compare : undefined,
  );
  const texts = useGit((state) =>
    state.compareTexts.tab === comparing ? state.compareTexts.texts : noTexts,
  );
  const { loadCompareTexts } = useGitActions();
  const view = useRef<HTMLDivElement>(null);
  const tab = compare?.tab;
  useEffect(() => {
    if (tab !== undefined) {
      view.current
        ?.querySelector<HTMLElement>('[data-column-focus]')
        ?.focus({ preventScroll: true });
    }
  }, [tab]);
  return (
    <div className="repository compare-view" ref={view}>
      <div className="columns compare-columns">
        <Diff
          selection={`${compare?.old}\n${compare?.new}`}
          path={compare?.name}
          note={noteOf(compare)}
          loading={compare === undefined}
          files={noFiles}
          patch={compare?.patch ?? ''}
          leftOut={noLeftOut}
          whitespaceOnly={noPaths}
          diffs={compare?.version ?? 0}
          largeFiles={noLargeFiles}
          onLoadFile={ignored}
          texts={texts}
          onLoadTexts={loadCompareTexts}
          fileContent={undefined}
          error={compare?.error}
          changeMarks={compare?.entire ?? false}
          entire={compare?.entire ?? false}
          origin={undefined}
          findAsked={findAsked}
          filter={undefined}
          options={<DiffOptions language={language} />}
          languageKey={compareLanguageKey(comparing)}
        />
      </div>
    </div>
  );
}
