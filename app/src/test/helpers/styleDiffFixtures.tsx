import type { ShownOptions } from './componentFixtures';
import { DiffToggles } from '../../components/diff/page/toggles';
import { SearchBar } from '../../lib/page/searchBar';
import { plainSearch } from '../../lib/shared/searchOptions';
import type { FindRange } from '../../lib/shared/textMatches';
import { ScrollbarMarks } from '../../lib/page/scrollbarMarks';
import { Code, MarkedCode } from '../../components/diff/page/codeMarks';
import { diffRowClass } from '../../components/diff/page/rowClasses';
import { DiffView } from '../../components/diff/page/view';
import { FileHeader } from '../../components/diff/page/rowParts';
import { noop } from './fixtures';
import { diffLookOf, diffMeasuring } from './diffFixtures';
import { unmeasuredDiff } from '../../components/diff/page/measures';

export function DiffOptionsShown(shown: ShownOptions) {
  return (
    <DiffToggles
      language={undefined}
      entire={shown.entire ?? false}
      ignoreWhitespace={shown.ignoreWhitespace ?? true}
      layout={shown.layout ?? 'inline'}
      wordWrap={shown.wordWrap ?? false}
      showWhitespace={shown.showWhitespace ?? false}
      onEntire={noop}
      onIgnoreWhitespace={noop}
      onLayout={noop}
      onWordWrap={noop}
      onShowWhitespace={noop}
    />
  );
}

export function DiffFindShown({ query = '' }: { readonly query?: string }) {
  return (
    <SearchBar
      font="monospace"
      query={query}
      options={plainSearch}
      found={{ current: 0, matches: 0 }}
      onQuery={noop}
      onOptions={noop}
      onStep={noop}
      onClose={noop}
    />
  );
}

export function ScrollbarMarksShown() {
  return (
    <div className="diff-view">
      <ScrollbarMarks
        marks={[
          { kind: 'added', top: 0, height: 0.1 },
          { kind: 'removed', top: 0.2, height: 0.1 },
          { kind: 'match', top: 0.4, height: 0.1 },
        ]}
      />
    </div>
  );
}

export function DiffRow({
  split = false,
  children,
}: {
  readonly split?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div className={diffRowClass(split ? 'split' : 'line')}>{children}</div>
  );
}

export function FileHeaderRow() {
  return (
    <DiffRow>
      <FileHeader path="a" open whole={false} collapsible onClick={noop} />
    </DiffRow>
  );
}

export function InlineLine({
  kind,
  words = [],
  finds = [],
  current,
  marker = false,
  whole = false,
}: {
  readonly kind: 'context' | 'added' | 'removed';
  readonly words?: readonly FindRange[];
  readonly finds?: readonly FindRange[];
  readonly current?: FindRange;
  readonly marker?: boolean;
  readonly whole?: boolean;
}) {
  return (
    <DiffRow>
      <div
        className={`diff-line text-line ${kind} ${whole ? 'whole-change' : ''}`}
      >
        <span className="number">1</span>
        <span className="number">1</span>
        <span className="split-code">
          <span className="code">
            <MarkedCode
              text={'a b c'}
              syntax={[]}
              words={words}
              wordClass={kind === 'removed' ? 'word-removed' : 'word-added'}
              found={finds}
              foundNow={current}
            />
          </span>
        </span>
        {marker && <button className={`hidden-change left ${kind}`} />}
      </div>
    </DiffRow>
  );
}

export function IndentedLine() {
  return (
    <DiffRow>
      <div className="diff-line text-line added">
        <span className="number">1</span>
        <span className="number">1</span>
        <Code
          text="  a"
          syntax={[]}
          words={[]}
          wordClass="word-added"
          finds={[]}
          current={undefined}
          whitespace
          indent={2}
        />
      </div>
    </DiffRow>
  );
}

export function SplitLine({
  left,
  right,
}: {
  readonly left: string;
  readonly right: string;
}) {
  return (
    <DiffRow split>
      <div className="split-line">
        {[left, right].map((change, side) => (
          <div
            key={side}
            className={`diff-line text-line split-side ${change}`}
          >
            <span className="number">1</span>
            <span className="split-code">
              {change !== 'filler' && <span className="code">a</span>}
            </span>
          </div>
        ))}
      </div>
    </DiffRow>
  );
}

export function DiffViewShown({
  sideBySide = false,
  wordWrap = false,
  showWhitespace = false,
  whole = false,
}: {
  readonly sideBySide?: boolean;
  readonly wordWrap?: boolean;
  readonly showWhitespace?: boolean;
  readonly whole?: boolean;
}) {
  return (
    <DiffView
      error={null}
      keptPlace={undefined}
      placeNow={() => undefined}
      onPlace={noop}
      files={[]}
      whole={whole ? { path: 'a.txt', content: 'a', binary: false } : undefined}
      origin={undefined}
      loading={false}
      diff={1}
      onLoad={noop}
      texts={new Map()}
      onLoadTexts={noop}
      matches={[]}
      current={0}
      jump={0}
      firstChange={undefined}
      look={diffLookOf({ sideBySide, wordWrap, showWhitespace })}
      measures={unmeasuredDiff}
      measuring={diffMeasuring}
    />
  );
}
