import { memo } from 'react';
import { type CommitInfo } from '../shared/protocol';
import { CommitBubble, HeadBubble, RefBubble, StashBubble } from './bubbles';
import { commitMenuTarget, useOpenMenu } from './menus';
import { detachedHead } from './selectors';
import { useGit } from './store';
import { formatDate } from '../../../lib/page/dates';
import { useShell } from '../../../shell/page/store';
import { HighlightWords } from '../../../lib/page/highlight';
import { noFilter, type Filter } from '../../../lib/shared/filter';
import { type Click } from '../../../lib/shared/keymap';
import { bubblesOn, type Bubble } from './bubbleLooks';
import { inLines } from './bubbleLines';
import { noRefs, isCompareClick, commitClass } from './commitListItems';

const noBubbles: ReadonlySet<string> = new Set();

export const CommitBubbles = memo(function CommitBubbles({
  hash,
  lines,
}: {
  hash: string;
  lines?: readonly number[];
}) {
  const refs = useGit((state) => state.refsByCommit.get(hash) ?? noRefs);
  const stash = useGit((state) => state.stashCommits.has(hash));
  const detached = useGit((state) => detachedHead(state) === hash);
  const bookmarked = useGit((state) => state.bookmarked.has(hash));
  const bubbles = bubblesOn(hash, {
    refsByCommit: new Map([[hash, refs]]),
    stashCommits: stash ? new Set([hash]) : noBubbles,
    bookmarked: bookmarked ? new Set([hash]) : noBubbles,
    detached: detached ? hash : undefined,
  }).map((bubble) => bubbleElement(bubble, hash));
  if (bubbles.length === 0) {
    return null;
  }
  if (
    lines === undefined ||
    lines.reduce((sum, count) => sum + count, 0) !== bubbles.length
  ) {
    return (
      <div className="bubble-line">
        {bubbles.flatMap((bubble, index) =>
          index === 0 ? [bubble] : [<wbr key={`break:${index}`} />, bubble],
        )}
      </div>
    );
  }
  return inLines(bubbles, lines).map((shown, line) => (
    <div key={line} className="bubble-line laid-out">
      {shown}
    </div>
  ));
});

function bubbleElement(bubble: Bubble, hash: string): React.ReactElement {
  if (bubble.type === 'head') {
    return <HeadBubble key="HEAD" hash={hash} />;
  }
  if (bubble.type === 'ref') {
    return (
      <RefBubble
        key={`${bubble.ref.kind}:${bubble.ref.name}`}
        info={bubble.ref}
        tracking={bubble.ref.tracking}
        actions
      />
    );
  }
  return bubble.type === 'bookmark' ? (
    <CommitBubble key="bookmark" hash={hash} />
  ) : (
    <StashBubble key="stash" />
  );
}

export function CommitRow({
  commit,
  selected,
  indent,
  onSelect,
  onCompare,
  highlight = noFilter,
  itemProps,
  corner,
  bubbleLines,
  children,
}: {
  commit: CommitInfo;
  selected: string | undefined;
  indent: number;
  onSelect: (hash: string) => void;
  onCompare?: (hash: string) => void;
  highlight?: Filter;
  itemProps?: React.HTMLAttributes<HTMLDivElement>;
  corner?: React.ReactNode;
  bubbleLines?: readonly number[];
  children?: React.ReactNode;
}) {
  const openMenu = useOpenMenu();
  const dateFormat = useShell((state) => state.dateFormat);
  const headCommit = useGit((state) => state.tab.repository?.headCommit);
  const stash = useGit((state) => state.stashCommits.has(commit.hash));
  return (
    <div
      {...itemProps}
      className={commitClass(commit.hash, selected, headCommit)}
      style={{ paddingLeft: indent }}
      onClick={(event: Click) =>
        onCompare && isCompareClick(event)
          ? onCompare(commit.hash)
          : onSelect(commit.hash)
      }
      onContextMenu={
        stash
          ? undefined
          : (event) => openMenu(event, commitMenuTarget(commit.hash))
      }
    >
      <div className="commit-line">
        <span className="subject">
          <HighlightWords text={commit.subject} filter={highlight} />
        </span>
        {corner}
      </div>
      <div className="commit-line secondary">
        <span className="author">
          <HighlightWords text={commit.authorName} filter={highlight} />
        </span>
        <span className="date">
          {formatDate(commit.commitDate, dateFormat)}
        </span>
      </div>
      <CommitBubbles hash={commit.hash} lines={bubbleLines} />
      {children}
    </div>
  );
}
