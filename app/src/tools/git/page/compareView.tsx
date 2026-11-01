import type {
  CompareView as Compared,
  DiffLayout,
  FileChange,
  LeftOut,
} from '../shared/protocol';
import type { DiffFile, LoadedText } from './diff';
import { Diff, DiffOptions } from './diffColumn';

const noFiles: readonly FileChange[] = [];
const noLeftOut: readonly LeftOut[] = [];
const noPaths: readonly string[] = [];
const noLargeFiles: ReadonlyMap<string, DiffFile> = new Map();
const noTexts: ReadonlyMap<string, LoadedText> = new Map();
const ignored = () => undefined;

export function CompareView({
  compare,
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
  return (
    <div className="repository compare-view">
      <div className="columns compare-columns">
        <Diff
          selection={`${compare?.old}\n${compare?.new}`}
          path={undefined}
          loading={compare === undefined}
          files={noFiles}
          patch={compare?.patch ?? ''}
          leftOut={noLeftOut}
          whitespaceOnly={noPaths}
          diffs={compare?.version ?? 0}
          largeFiles={noLargeFiles}
          onLoadFile={ignored}
          texts={noTexts}
          onLoadTexts={ignored}
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
              layout={layout}
              onLayout={onLayout}
            />
          }
        />
      </div>
    </div>
  );
}
