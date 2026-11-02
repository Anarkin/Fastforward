import { useEffect, useRef } from 'react';
import type {
  CompareView as Compared,
  DiffLayout,
  FileChange,
  LeftOut,
  TextRequest,
} from '../shared/protocol';
import { useTextView } from '../../../ui/textView';
import { strings } from '../../../shared/strings';
import type { DiffFile, LoadedText } from './diff';
import { Diff, DiffOptions } from './diffColumn';

const noFiles: readonly FileChange[] = [];
const noLeftOut: readonly LeftOut[] = [];
const noPaths: readonly string[] = [];
const noLargeFiles: ReadonlyMap<string, DiffFile> = new Map();
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
  compare,
  texts,
  onLoadTexts,
  pinned,
  layout,
  wordWrap,
  showWhitespace,
  ignoreWhitespace,
  findAsked,
  onEntire,
  onPin,
  onLayout,
  onWordWrap,
  onShowWhitespace,
  onIgnoreWhitespace,
}: {
  compare: Compared | undefined;
  texts: ReadonlyMap<string, LoadedText>;
  onLoadTexts: (requests: TextRequest[]) => void;
  pinned: boolean;
  layout: DiffLayout;
  wordWrap: boolean;
  showWhitespace: boolean;
  ignoreWhitespace: boolean;
  findAsked: number;
  onEntire: (entire: boolean) => void;
  onPin: (pinned: boolean) => void;
  onLayout: (layout: DiffLayout) => void;
  onWordWrap: (wrap: boolean) => void;
  onShowWhitespace: (show: boolean) => void;
  onIgnoreWhitespace: (ignore: boolean) => void;
}) {
  const textView = useTextView();
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
          onLoadTexts={onLoadTexts}
          fileContent={undefined}
          error={compare?.error}
          changeMarks={compare?.entire ?? false}
          entire={compare?.entire ?? false}
          sideBySide={layout === 'sideBySide'}
          wordWrap={wordWrap}
          showWhitespace={showWhitespace}
          origin={undefined}
          findAsked={findAsked}
          filter={undefined}
          options={
            <DiffOptions
              entire={compare?.entire === true && !pinned}
              pinned={pinned}
              canShow
              onEntire={onEntire}
              onPin={onPin}
              showWhitespace={showWhitespace}
              onShowWhitespace={onShowWhitespace}
              ignoreWhitespace={ignoreWhitespace}
              onIgnoreWhitespace={onIgnoreWhitespace}
              wordWrap={wordWrap}
              onWordWrap={onWordWrap}
              highlightSyntax={textView.view.highlightSyntax}
              onHighlightSyntax={(highlightSyntax) =>
                textView.change({ ...textView.view, highlightSyntax })
              }
              layout={layout}
              onLayout={onLayout}
            />
          }
        />
      </div>
    </div>
  );
}
