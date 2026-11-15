import { memo } from 'react';
import { type CommitInfo } from '../shared/protocol';
import { CommitBubble, HeadBubble, RefBubble, StashBubble } from './bubbles';
import { commitMenuTarget, useOpenMenu } from './menus';
import { detachedHead, useGit } from './store';
import { formatDate } from '../../../lib/page/dates';
import { useShell } from '../../../shell/page/store';
import { Highlight } from './highlight';
import { type Click } from '../../../lib/shared/keymap';
import { inPairs } from './bubbleOrder';
import { noRefs, isCompareClick, commitClass } from './commitListItems';

export const CommitBubbles = memo(function CommitBubbles({
  hash,
}: {
  hash: string;
}) {
  const refs = useGit((state) => state.refsByCommit.get(hash) ?? noRefs);
  const stash = useGit((state) => state.stashCommits.has(hash));
  const detached = useGit((state) => detachedHead(state) === hash);
  const bookmarked = useGit((state) => state.bookmarked.has(hash)) && !detached;
  if (!detached && refs.length === 0 && !stash && !bookmarked) {
    return null;
  }
  const bubbles = [
    ...(detached ? [<HeadBubble key="HEAD" hash={hash} />] : []),
    ...inPairs(refs).map((ref) => (
      <RefBubble
        key={`${ref.kind}:${ref.name}`}
        info={ref}
        tracking={ref.tracking}
        actions
      />
    )),
    ...(bookmarked ? [<CommitBubble key="bookmark" hash={hash} />] : []),
    ...(stash ? [<StashBubble key="stash" />] : []),
  ];
  return (
    <div className="bubble-line">
      {bubbles.flatMap((bubble, index) =>
        index === 0 ? [bubble] : [<wbr key={`break:${index}`} />, bubble],
      )}
    </div>
  );
});

export function CommitRow({
  commit,
  selected,
  indent,
  onSelect,
  onCompare,
  highlight = '',
  itemProps,
  corner,
  children,
}: {
  commit: CommitInfo;
  selected: string | undefined;
  indent: number;
  onSelect: (hash: string) => void;
  onCompare?: (hash: string) => void;
  highlight?: string;
  itemProps?: React.HTMLAttributes<HTMLDivElement>;
  corner?: React.ReactNode;
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
          <Highlight text={commit.subject} query={highlight} />
        </span>
        {corner}
      </div>
      <div className="commit-line secondary">
        <span className="author">
          <Highlight text={commit.authorName} query={highlight} />
        </span>
        <span className="date">
          {formatDate(commit.commitDate, dateFormat)}
        </span>
      </div>
      <CommitBubbles hash={commit.hash} />
      {children}
    </div>
  );
}

export const ListedCommitRow = memo(CommitRow);
