import type { ShellAccess } from '../../../shell/main/shell';
import type { WorktreeInfo } from '../shared/protocol';
import { remoteDefaultBranches } from './branches';
import type { Contexts } from './contexts';
import { tagRemoteOf } from './operations';
import { defaultBookmarks } from './refs';
import type { Remotes } from './remotes';
import type { Refs } from './repository';
import type { GitSessions } from './sessions';
import type { GitStorage } from './storage';
import type { Context, ReadRefs, Session } from './tabContext';
import { tabInfos } from './tabNames';

export class TabPosts {
  constructor(
    private readonly storage: GitStorage,
    private readonly shell: () => ShellAccess,
    private readonly sessions: GitSessions,
    private readonly contexts: Contexts,
    private readonly remotes: () => Remotes,
    private readonly worktreeLists: ReadonlyMap<
      string,
      readonly WorktreeInfo[]
    >,
    private readonly save: (saving: Promise<void>) => void,
  ) {}

  async sendRepository(
    context: Context,
    refs: Promise<ReadRefs>,
  ): Promise<void> {
    const { head, refs: listed, remotes, stashes, read } = await refs;
    const tagRemote = await tagRemoteOf(
      context.gitPath,
      context.root,
      remotes,
    ).catch(() => undefined);
    const { tab } = context;
    if (read < tab.repositoryShown) {
      return;
    }
    tab.repositoryShown = read;
    context.post({
      type: 'repository',
      head: head?.name,
      headCommit: head?.commit,
      refs: listed,
      ...(tagRemote !== undefined &&
        this.storage.remoteTagsOf(context.repository).has(tagRemote) && {
          tagRemote,
        }),
      stashes: stashes.map(({ name, commit, message }) => ({
        name,
        commit,
        message,
      })),
    });
  }

  postTabs(session: Session): void {
    const { storage } = this;
    const active = this.sessions.activeRepositoryIn(session);
    const worktree = this.sessions.activeWorktreeIn(session);
    this.sendTabs(session);
    session.post({
      type: 'bookmarks',
      bookmarks: active ? (storage.bookmarksOf(active) ?? []) : [],
    });
    session.post({
      type: 'solo',
      solo: worktree !== undefined && storage.soloOf(worktree),
    });
    this.remotes().postLastFetch(session, active);
  }

  sendTabs(session: Session): void {
    const active = this.sessions.activeRepositoryIn(session);
    session.post({
      type: 'worktrees',
      worktree: this.sessions.activeWorktreeIn(session),
      worktrees: active === undefined ? [] : this.worktreeLists.get(active),
    });
    this.sendRecent(session);
  }

  sendRecent(session: Session): void {
    session.post({
      type: 'recent',
      recent: tabInfos(
        this.storage.recent
          .filter(
            (root) =>
              !this.sessions.hasRepository(root) &&
              !this.sessions.hasRepository(this.sessions.repositoryOf(root)),
          )
          .slice(0, this.shell().recentFolders()),
      ),
    });
  }

  sendRecentEverywhere(): void {
    for (const page of this.shell().pages()) {
      this.sendRecent(this.sessions.of(page));
    }
  }

  async addDefaultBookmarks(
    context: Context,
    refs?: Promise<Refs>,
  ): Promise<void> {
    const saved = this.storage.bookmarksOf(context.repository);
    if (saved !== undefined) {
      context.post({ type: 'bookmarks', bookmarks: saved });
      return;
    }
    const [{ head, refs: listed }, defaults] = await Promise.all([
      refs ?? this.contexts.refsOf(context),
      remoteDefaultBranches(context.gitPath, context.root),
    ]);
    const bookmarks = defaultBookmarks(listed, defaults);
    if (head?.commit !== undefined) {
      this.save(this.storage.setBookmarks(context.repository, bookmarks));
    }
    context.post({ type: 'bookmarks', bookmarks });
  }
}
