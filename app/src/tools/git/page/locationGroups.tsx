import { tip } from '../../../lib/page/tips';
import type { CommitInfo, StashInfo } from '../shared/protocol';
import { CommitBubble, HeadBubble, RefBubble } from './bubbles';
import { useOpenMenu, refMenuTarget } from './menus';
import { CommitRow } from './commitRow';
import { detachedHead } from './selectors';
import { useGit } from './store';
import { HighlightWords } from '../../../lib/page/highlight';
import type { Filter } from '../../../lib/shared/filter';
import { strings } from '../../../lib/shared/strings';
import { Words } from '../../../lib/page/name';
import {
  SearchGroup,
  PinnedResult,
  commitKey,
  stashKey,
  refKey,
  pinnedKey,
} from './locationResults';
import { RefLabel } from './locationsSearch';
import { Rows, rowProps, activeClass } from './locationRows';

const commitIndent = 8;

export function CommitResultsSection({
  hash,
  lookingUp,
  searching,
  found,
  hashMore,
  capped,
  filter,
  active,
  rows,
  onJump,
}: {
  hash: string | undefined;
  lookingUp: boolean;
  searching: boolean;
  found: readonly CommitInfo[];
  hashMore: number;
  capped: boolean;
  filter: Filter;
  active: string | undefined;
  rows: Rows;
  onJump: (commit: string) => void;
}) {
  if (found.length === 0) {
    const status =
      lookingUp && hash !== undefined
        ? strings.search.lookingUp(hash)
        : searching
          ? strings.search.searching
          : hash && strings.search.noCommitStartsWith(hash);
    return status ? (
      <div className="row hash-suggestion empty">
        <Words>{status}</Words>
      </div>
    ) : null;
  }
  return (
    <section
      className="locations-group"
      role="group"
      aria-label={strings.search.commits}
    >
      <GroupHeading
        title={strings.search.commits}
        count={found.length + hashMore}
      />
      <div className="locations-list">
        {found.map((commit) => (
          <CommitRow
            key={commit.hash}
            commit={commit}
            selected={active}
            indent={commitIndent}
            onSelect={onJump}
            highlight={filter}
            itemProps={rowProps(rows, commitKey(commit.hash), 1)}
          />
        ))}
        {(lookingUp || searching) && (
          <div className="locations-empty">{strings.search.searching}</div>
        )}
        {hashMore > 0 ? (
          <div className="locations-empty">{strings.search.more(hashMore)}</div>
        ) : (
          capped && (
            <div className="locations-empty">{strings.search.moreCommits}</div>
          )
        )}
      </div>
    </section>
  );
}

export function StashesSection({
  stashes,
  more,
  filter,
  rows,
  onJump,
}: {
  stashes: readonly StashInfo[];
  more: number;
  filter: Filter;
  rows: Rows;
  onJump: (commit: string) => void;
}) {
  if (stashes.length === 0) {
    return null;
  }
  return (
    <section
      className="locations-group"
      role="group"
      aria-label={strings.search.stashes}
    >
      <GroupHeading
        title={strings.search.stashes}
        count={stashes.length + more}
      />
      <div className="locations-list">
        {stashes.map((stash) => (
          <div
            key={stash.name}
            {...rowProps(rows, stashKey(stash), 1)}
            className={`row result ${activeClass(rows, stashKey(stash))}`}
            {...tip(stash.message)}
            onClick={() => onJump(stash.commit)}
          >
            <span className="badge stash">
              <HighlightWords text={stash.name} filter={filter} />
            </span>
            <span className="stash-message">
              <HighlightWords text={stash.message} filter={filter} />
            </span>
          </div>
        ))}
        {more > 0 && (
          <div className="locations-empty">{strings.search.more(more)}</div>
        )}
      </div>
    </section>
  );
}

export function GroupHeading({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <header className="locations-heading">
      {title}
      <span className="locations-count">{count}</span>
    </header>
  );
}

export function BookmarksSection({
  pinned,
  rows,
  onJump,
}: {
  pinned: readonly PinnedResult[];
  rows: Rows;
  onJump: (commit: string) => void;
}) {
  const detached = useGit(detachedHead);
  if (pinned.length === 0) {
    return null;
  }
  return (
    <section
      className="locations-group"
      role="group"
      aria-label={strings.search.bookmarks}
    >
      <GroupHeading title={strings.search.bookmarks} count={pinned.length} />
      <div className="locations-list">
        {pinned.map(({ bookmark, commit }) => {
          const key = pinnedKey(bookmark);
          return (
            <div
              key={`${bookmark.kind}:${bookmark.name}`}
              {...rowProps(rows, key, 1)}
              className={`row result pinned ${activeClass(rows, key)}`}
              onClick={() => commit && onJump(commit)}
            >
              {bookmark.kind !== 'commit' ? (
                <RefBubble info={bookmark} missing={commit === undefined} />
              ) : bookmark.name === detached ? (
                <HeadBubble hash={bookmark.name} />
              ) : (
                <CommitBubble hash={bookmark.name} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SearchResults({
  group,
  filter,
  rows,
  onJump,
}: {
  group: SearchGroup;
  filter: Filter;
  rows: Rows;
  onJump: (commit: string) => void;
}) {
  const openMenu = useOpenMenu();
  return (
    <>
      {group.refs.map((ref) => (
        <div
          key={ref.name}
          {...rowProps(rows, refKey(ref), 1)}
          className={`row result ${activeClass(rows, refKey(ref))}`}
          {...tip(ref.name, { cut: true })}
          onClick={() => onJump(ref.commit)}
          onContextMenu={(event) => openMenu(event, refMenuTarget(ref))}
        >
          <RefLabel info={ref}>
            <HighlightWords text={ref.name} filter={filter} />
          </RefLabel>
        </div>
      ))}
      {group.more > 0 && (
        <div className="locations-empty">{strings.search.more(group.more)}</div>
      )}
    </>
  );
}
