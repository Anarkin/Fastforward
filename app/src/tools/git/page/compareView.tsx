import { useEffect, useMemo, useRef, useState } from 'react';
import { useBinding } from '../../../lib/page/shortcuts';
import { gitKeymap } from './keymap';
import type {
  CompareView as Compared,
  FileChange,
  LeftOut,
} from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';
import type { DiffFile, LoadedText } from './diff';
import { Diff, DiffLanguage, DiffOptions } from './diffColumn';
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

export function CompareView({ comparing }: { comparing: string }) {
  const [findAsked, setFindAsked] = useState(0);
  useBinding(gitKeymap.find, () => setFindAsked((count) => count + 1));
  const compare = useGit((state) =>
    state.compare?.tab === comparing ? state.compare : undefined,
  );
  const texts = useGit((state) =>
    state.compareTexts.tab === comparing ? state.compareTexts.texts : noTexts,
  );
  const { loadCompareTexts } = useGitActions();
  const view = useRef<HTMLDivElement>(null);
  const tab = compare?.tab;
  const origin = useMemo(
    () => (tab === undefined ? undefined : { root: tab, hash: '' }),
    [tab],
  );
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
          origin={origin}
          findAsked={findAsked}
          filter={undefined}
          options={
            <DiffOptions language={<DiffLanguage comparing={comparing} />} />
          }
          languageKey={compareLanguageKey(comparing)}
        />
      </div>
    </div>
  );
}
