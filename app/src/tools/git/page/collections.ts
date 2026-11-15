import { bookmarkedCommits } from '../shared/refNames';
import { indexRefs } from './refIndex';
import { tagsOnRemote } from './tagPushes';
import type { TabView } from './tabView';
import type { GitCollections, GitData, GitSource } from './gitState';

const noNames: ReadonlySet<string> = new Set();

function remoteTagsOf({ repository }: TabView): ReadonlySet<string> {
  return repository?.tagRemote === undefined
    ? noNames
    : tagsOnRemote(repository.refs, repository.tagRemote);
}

function elsewhereOf({ worktrees, tab }: GitSource): ReadonlySet<string> {
  return new Set(
    (worktrees ?? [])
      .filter((worktree) => worktree.root !== tab.root)
      .map((worktree) => worktree.name),
  );
}

export function collected<T extends GitSource>(
  source: T,
  before?: GitData,
): T & GitCollections {
  return {
    ...source,
    bookmarked:
      before?.bookmarks === source.bookmarks
        ? before.bookmarked
        : bookmarkedCommits(source.bookmarks),
    tagsOnRemote:
      before !== undefined && before.tab.repository === source.tab.repository
        ? before.tagsOnRemote
        : remoteTagsOf(source.tab),
    elsewhere:
      before !== undefined &&
      before.worktrees === source.worktrees &&
      before.tab.root === source.tab.root
        ? before.elsewhere
        : elsewhereOf(source),
    ...(before !== undefined && before.tab.repository === source.tab.repository
      ? {
          refsByCommit: before.refsByCommit,
          stashCommits: before.stashCommits,
          refIndex: before.refIndex,
        }
      : {
          refsByCommit: Map.groupBy(
            source.tab.repository?.refs ?? [],
            (info) => info.commit,
          ),
          stashCommits: new Set(
            source.tab.repository?.stashes.map((stash) => stash.commit),
          ),
          refIndex: indexRefs(source.tab.repository?.refs ?? []),
        }),
  };
}
