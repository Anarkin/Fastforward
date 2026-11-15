import { inStores, optionStores, type ShownOptions } from './componentFixtures';
import { DiffOptions } from '../../tools/git/page/diffOptions';
import { FindField } from '../../lib/page/search';
import { gitKeymap } from '../../tools/git/page/keymap';
import type { FindRange } from '../../lib/shared/textMatches';
import { Minimap } from '../../tools/git/page/minimap';
import { Code, MarkedCode } from '../../tools/git/page/codeMarks';
import { diffRowClass } from '../../tools/git/page/diffRowClasses';
import { DiffView } from '../../tools/git/page/diffView';
import { FileHeader } from '../../tools/git/page/diffRowParts';
import { noop } from './fixtures';

export function DiffOptionsShown(shown: ShownOptions) {
  return inStores(optionStores(shown), <DiffOptions language={undefined} />);
}

export function DiffFindShown({ query = '' }: { readonly query?: string }) {
  return (
    <FindField
      query={query}
      count=""
      keys={gitKeymap}
      onQuery={noop}
      onStep={noop}
      onClose={noop}
    />
  );
}

export function MinimapShown() {
  return (
    <Minimap
      marks={[
        { kind: 'added', top: 0, height: 0.1 },
        { kind: 'removed', top: 0.2, height: 0.1 },
        { kind: 'match', top: 0.4, height: 0.1 },
      ]}
      scroller={{ current: null }}
      viewport={10}
      total={100}
      onScroll={noop}
    />
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
}: {
  readonly sideBySide?: boolean;
  readonly wordWrap?: boolean;
  readonly showWhitespace?: boolean;
}) {
  return inStores(
    optionStores({
      layout: sideBySide ? 'sideBySide' : 'inline',
      wordWrap,
      showWhitespace,
    }),
    <DiffView
      error={null}
      files={[]}
      whole={undefined}
      origin={undefined}
      loading={false}
      diff={1}
      onLoad={noop}
      texts={new Map()}
      onLoadTexts={noop}
      changeMarks
      matches={[]}
      current={0}
      jump={0}
      firstChange={undefined}
    />,
  );
}
