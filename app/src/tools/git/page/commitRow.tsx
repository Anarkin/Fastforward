import { memo } from 'react';
import { type CommitInfo, workingTreeHash } from '../shared/protocol';
import { CommitBubble, HeadBubble, RefBubble, StashBubble } from './bubbles';
import { commitMenuTarget, useOpenMenu } from './menus';
import { detachedHead } from './gitSelectors';
import { useGit } from './store';
import { formatDate } from '../../../lib/page/dates';
import { useShell } from '../../../shell/page/store';
import { HighlightWords } from '../../../lib/page/highlight';
import { noFilter, type Filter } from '../../../lib/shared/filter';
import { type Click } from '../../../lib/shared/keymap';
import { inPairs } from './bubbleOrder';
import {
  noRefs,
  isCompareClick,
  commitClass,
  selectionClasses,
} from './commitListItems';
import { strings } from '../../../lib/shared/strings';

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
  highlight = noFilter,
  itemProps,
  corner,
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
      <CommitBubbles hash={commit.hash} />
      {children}
    </div>
  );
}

export const ListedCommitRow = memo(CommitRow);

export function WorkingTreeRow({
  count,
  selection,
  indent,
  onSelect,
  onCompare,
}: {
  count: number;
  selection: string | undefined;
  indent: number;
  onSelect: (hash: string | undefined) => void;
  onCompare?: (hash: string) => void;
}) {
  const dirty = count > 0;
  return (
    <div
      style={{ paddingLeft: indent }}
      className={`commit working-tree ${dirty ? '' : 'empty'} ${selectionClasses(workingTreeHash, selection).join(' ')}`}
      onClick={(event: Click) =>
        onCompare && isCompareClick(event)
          ? onCompare(workingTreeHash)
          : onSelect(workingTreeHash)
      }
    >
      <div className="commit-line">
        <span className="subject">
          {strings.commits.uncommittedChanges(count)}
        </span>
      </div>
    </div>
  );
}
