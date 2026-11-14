import { AutoFetch, fetchOrder, type Timer } from './autoFetch';
import { gitErrorText } from './errorText';
import { keptGits } from './run';
import { hasGitFolder, isFolder } from './repository';
import { locateRepository } from './repositoryLocation';
import { Clones } from './clones';
import type { Log } from '../../../shell/main/log';
import type { TabMessage, GitToHost, WorktreeInfo } from '../shared/protocol';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/shell';
import { strings } from '../../../lib/shared/strings';
import { sameRoot } from '../../../shell/main/storage';
import type { GitStorage } from './storage';
import { historyLoaded, newTabState, toggleMerges } from './tabState';
import {
  type TabWork,
  type Session,
  type Context,
  allSettled,
  type GitCore,
  OpeningFailed,
} from './tabContext';
import { Diffs } from './diffs';
import { Refreshes } from './refreshes';
import { CommitNavigation } from './commitNavigation';
import { Remotes } from './remotes';
import { Watching } from './watching';
import { CompareTabs } from './compareTabs';
import { needsNoWholeHistory, wellFormed } from './messageChecks';
import { Worktrees } from './worktrees';
import { namesOfTabs } from './tabNames';
import { GitSessions } from './sessions';
import { Selections } from './selections';
import { RepositoryChoices } from './repositoryChoices';
import { Contexts } from './contexts';
import { TabPosts } from './tabPosts';
import { FileViews } from './fileViews';
import { Inits } from './inits';
import { ViewSettings } from './viewSettings';

export const refreshDelays = { delay: 100, gitDirDelay: 300, maxDelay: 1500 };
export type FolderPurpose = 'init' | 'clone';

export interface GitHost {
  readonly viewedFiles: string;
  chooseFolders(): Promise<readonly string[]>;
  chooseFolder(
    purpose: FolderPurpose,
    from?: string,
  ): Promise<string | undefined>;
  clipboardText(): Promise<string>;
}

export class GitTool implements Tool<'git'> {
  private shell: ShellAccess = unattachedShell;
  private readonly tabStates = new Map<string, TabWork>();
  private readonly repositories = new Map<string, string>();
  private readonly worktreeLists = new Map<string, readonly WorktreeInfo[]>();
  private readonly autoFetch: AutoFetch;
  private readonly quitting = new AbortController();
  private readonly clones: Clones;
  private readonly sessions: GitSessions;
  private readonly contexts: Contexts;
  private readonly posts: TabPosts;
  private readonly fileViews: FileViews;
  private readonly inits: Inits;
  private readonly viewSettings: ViewSettings;
  private readonly selections: Selections;
  private readonly choices: RepositoryChoices;
  private readonly core: GitCore;
  private readonly diffs: Diffs;
  private readonly refreshes: Refreshes;
  private readonly commitNavigation: CommitNavigation;
  private readonly remotes: Remotes;
  private readonly watching: Watching;
  private readonly compareTabs: CompareTabs;
  private readonly worktrees: Worktrees;

  constructor(
    private readonly log: Log,
    private readonly gitPath: string,
    private readonly storage: GitStorage,
    private readonly host: GitHost,
    timer?: Timer,
    delays: {
      delay: number;
      maxDelay: number;
      gitDirDelay?: number;
    } = refreshDelays,
  ) {
    const save = (saving: Promise<void>) => this.save(saving);
    this.sessions = new GitSessions(
      () => this.shell,
      storage,
      this.tabStates,
      this.repositories,
    );
    this.contexts = new Contexts(
      gitPath,
      storage,
      this.tabStates,
      this.sessions,
    );
    this.posts = new TabPosts(
      storage,
      () => this.shell,
      this.sessions,
      this.contexts,
      () => this.remotes,
      this.worktreeLists,
      save,
    );
    this.core = {
      context: (session, root, live) =>
        this.contexts.context(session, root, live),
      run: (failed, session, action, root) =>
        this.run(failed, session, action, root),
      live: (session) => this.sessions.live(session),
      page: () => this.sessions.page,
      sessionShowing: (root) => this.sessions.sessionShowing(root),
      sessionShowingRepository: (repository) =>
        this.sessions.sessionShowingRepository(repository),
      isActiveIn: (session, root) => this.sessions.isActiveIn(session, root),
      hasRepository: (root) => this.sessions.hasRepository(root),
      notify: (context) => this.sessions.notify(context),
      noticesOf: (session, repository) =>
        this.sessions.noticesOf(session, repository),
      refsOf: (context) => this.contexts.refsOf(context),
      sendRepository: (context, refs) =>
        this.posts.sendRepository(context, refs),
      rememberSelection: (context) => this.selections.remember(context),
      save,
    };
    this.diffs = new Diffs(storage, () => this.shell);
    this.selections = new Selections(
      storage,
      this.diffs,
      () => this.commitNavigation,
      save,
    );
    this.refreshes = new Refreshes(log, storage, () => this.shell, this.diffs, {
      live: (session) => this.sessions.live(session),
      refsOf: (context) => this.contexts.refsOf(context),
      sendRepository: (context, refs) =>
        this.posts.sendRepository(context, refs),
      rememberSelection: (context) => this.selections.remember(context),
      bookmarkedOf: (repository) => this.choices.bookmarkedOf(repository),
      sendNavigation: (context, current) =>
        this.commitNavigation.sendNavigation(context, current),
    });
    this.choices = new RepositoryChoices(
      storage,
      this.tabStates,
      this.sessions,
      this.contexts,
      this.refreshes,
      save,
    );
    this.commitNavigation = new CommitNavigation(
      log,
      storage,
      () => this.shell,
      this.diffs,
      this.refreshes,
      this.core,
    );
    this.remotes = new Remotes(
      log,
      gitPath,
      storage,
      () => this.shell,
      this.refreshes,
      this.commitNavigation,
      this.core,
      this.quitting,
      this.repositories,
    );
    this.watching = new Watching(
      log,
      delays,
      () => this.shell,
      this.refreshes,
      this.core,
      this.tabStates,
      {
        loadWorktrees: (session, repository) =>
          this.worktrees.loadWorktrees(session, repository),
      },
    );
    this.compareTabs = new CompareTabs(log, gitPath, storage, this.watching);
    this.worktrees = new Worktrees(
      log,
      gitPath,
      storage,
      () => this.shell,
      this.core,
      this.watching,
      this.commitNavigation,
      this.tabStates,
      this.repositories,
      this.worktreeLists,
      {
        repositoryTabs: () => this.sessions.repositoryTabs,
        repositoryOf: (root) => this.sessions.repositoryOf(root),
        isActive: (root) => this.sessions.isActive(root),
        tabState: (root) => this.contexts.tabState(root),
        showTab: (context) => this.showTab(context),
        postTabs: (session) => this.posts.postTabs(session),
        sendTabs: (session) => this.posts.sendTabs(session),
        sendRecentEverywhere: () => this.posts.sendRecentEverywhere(),
      },
    );
    this.fileViews = new FileViews(
      log,
      gitPath,
      host.viewedFiles,
      () => this.shell,
      this.tabStates,
      this.compareTabs,
      this.sessions,
    );
    this.inits = new Inits(log, gitPath, this.worktrees);
    this.autoFetch = new AutoFetch(
      () => storage.autoFetchMinutes,
      () =>
        fetchOrder(
          this.sessions.repositoryTabs,
          this.sessions.shownRepositories(),
        ),
      (root) => this.shell.track(this.remotes.fetchInBackground(root)),
      timer,
    );
    this.autoFetch.update();
    this.viewSettings = new ViewSettings(
      storage,
      this.tabStates,
      () => this.autoFetch,
      this.compareTabs,
      this.diffs,
      this.refreshes,
      this.contexts,
      save,
    );
    this.clones = new Clones(
      log,
      gitPath,
      {
        post: (message) => this.sessions.cloneSession()?.post(message),
        open: async (target) => {
          const session = this.sessions.cloneSession();
          if (session !== undefined) {
            await this.runNow(strings.log.openingFailed(target), session, () =>
              this.worktrees.openRepositories(session, [target]),
            );
          }
        },
        track: (work) => void this.shell.track(work),
        chooseFolder: (from) => host.chooseFolder('clone', from),
        clipboardText: () => host.clipboardText(),
        savedFolder: () => storage.cloneFolder,
        saveFolder: (folder) => this.save(storage.setCloneFolder(folder)),
      },
      this.quitting.signal,
    );
  }

  quit(): void {
    this.quitting.abort();
    this.save(this.storage.saveFetches());
  }

  reloadSettings(): void {
    keptGits.update();
    this.autoFetch.update();
    this.viewSettings.reloaded();
    this.posts.sendRecentEverywhere();
  }

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(page: Page): void {
    const { cloningIn } = this.sessions;
    if (
      cloningIn === undefined ||
      this.sessions.live(cloningIn) === undefined
    ) {
      this.clones.pageLoaded();
    }
    const session = this.sessions.of(page);
    session.post(this.storage.layout);
    this.posts.sendRecent(session);
  }

  async show(page: Page, tab: Tab): Promise<void> {
    const session = this.sessions.of(page);
    if (tab.compare !== undefined) {
      await this.compareTabs.showCompare(session, tab.id, tab.compare);
      return;
    }
    this.compareTabs.stopComparing(session);
    const { root } = tab;
    if (root === undefined) {
      return;
    }
    await this.run(
      strings.log.showingTabFailed(root),
      session,
      () => this.worktrees.openTab(session, root),
      this.storage.worktreeOf(root),
    );
  }

  shows(page: Page): boolean {
    return this.sessions.showsActiveTab(this.sessions.of(page));
  }

  hide(page: Page): void {
    const session = this.sessions.of(page);
    this.compareTabs.stopComparing(session);
    this.watching.stopWatching(session);
    this.posts.postTabs(session);
  }

  async preload(page: Page, tab: Tab): Promise<void> {
    const { root } = tab;
    if (root === undefined) {
      return;
    }
    const session = this.sessions.of(page);
    await this.run(strings.log.preloadingFailed(root), session, () =>
      allSettled([
        this.worktrees.loadWorktrees(session, root),
        this.preloadRoot(session, this.storage.worktreeOf(root), root),
      ]),
    );
  }

  closed(page: Page, tab: Tab): void {
    const { root: closed } = tab;
    if (closed === undefined) {
      return;
    }
    for (const [root, state] of this.tabStates) {
      if (sameRoot(this.sessions.repositoryOf(root), closed)) {
        this.worktrees.forgetTab(root, state);
      }
    }
    this.save(this.worktrees.forgetUnused([closed]));
    this.posts.sendRecentEverywhere();
  }

  receive(page: Page, message: GitToHost): Promise<void> {
    if (!wellFormed(message)) {
      return Promise.resolve();
    }
    const session = this.sessions.of(page);
    return this.run(
      strings.log.handlingFailed(message.type),
      session,
      () => this.handle(message, session),
      this.worktreeAsked(message),
    );
  }

  refreshShown(page: Page): Promise<void> {
    const session = this.sessions.of(page);
    return this.run(
      strings.log.refreshingFailed,
      session,
      async () => {
        const context = await this.contexts.context(session);
        if (context) {
          await this.refreshes.refresh(context);
        }
      },
      this.sessions.activeWorktreeIn(session),
    );
  }

  names(tabs: readonly Tab[]): ReadonlyMap<string, TabName> {
    return namesOfTabs(tabs);
  }

  async fits(folder: string): Promise<boolean> {
    try {
      return (await locateRepository(this.gitPath, folder)) !== undefined;
    } catch {
      return false;
    }
  }

  folderOf(tab: Tab): string | undefined {
    return tab.root === undefined
      ? undefined
      : this.storage.worktreeOf(tab.root);
  }

  visited(): void {}

  open(page: Page, folders: readonly string[]): Promise<void> {
    const session = this.sessions.of(page);
    return this.run(strings.log.openingAskedFailed, session, () =>
      this.worktrees.openRepositories(session, folders),
    );
  }

  newTab(page: Page): Promise<void> {
    const session = this.sessions.of(page);
    return this.run(strings.log.openingAskedFailed, session, async () =>
      this.worktrees.openRepositories(session, await this.host.chooseFolders()),
    );
  }

  idle(): Promise<void> {
    return this.shell.idle();
  }

  image(url: URL): Promise<Response> {
    return this.fileViews.image(url);
  }

  initRepositoryIn(folder: string): Promise<void> {
    const session = this.sessions.page;
    return session === undefined
      ? Promise.resolve()
      : this.inits.initIn(session, folder);
  }

  cloneInto(folder: string): Promise<void> {
    this.sessions.cloningIn = this.sessions.page;
    return this.clones.openIn(folder);
  }

  private worktreeAsked(message: GitToHost): string | undefined {
    switch (message.type) {
      case 'openRepository':
        return this.storage.worktreeOf(message.root);
      default:
        return 'root' in message ? message.root : undefined;
    }
  }

  private run(
    failed: string,
    session: Session,
    action: () => Promise<void>,
    root?: string,
  ): Promise<void> {
    return this.shell.track(this.runNow(failed, session, action, root));
  }

  private async runNow(
    failed: string,
    session: Session,
    action: () => Promise<void>,
    asked?: string,
  ): Promise<void> {
    try {
      await action();
    } catch (thrown) {
      const { root, error } =
        thrown instanceof OpeningFailed
          ? thrown
          : { root: asked, error: thrown };
      const text = gitErrorText(error);
      this.log.error(failed);
      this.log.error(error instanceof Error ? error : text);
      const gone = root !== undefined && (await this.folderGone(root));
      if (root === undefined || this.sessions.isActiveIn(session, root)) {
        session.post({
          type: 'error',
          message: gone ? strings.messages.notRepository(root) : text,
        });
      }
    }
  }

  private async folderGone(root: string): Promise<boolean> {
    const tab = this.tabStates.get(root);
    if (!tab || ((await isFolder(root)) && (await hasGitFolder(root)))) {
      return false;
    }
    tab.isRepository = false;
    if (tab.refreshError !== undefined) {
      tab.refreshError = strings.messages.notRepository(root);
    }
    return true;
  }

  private async handle(message: GitToHost, session: Session): Promise<void> {
    const { storage, sessions } = this;
    switch (message.type) {
      case 'selectWorktree': {
        const repository = sessions.activeRepositoryIn(session);
        const root = sessions.knownRoot(message.root);
        if (
          repository === undefined ||
          !sameRoot(sessions.repositoryOf(root), repository) ||
          (sessions.isActiveIn(session, root) &&
            sessions.showsActiveTab(session))
        ) {
          return;
        }
        this.save(storage.setWorktree(repository, root));
        await this.worktrees.openTab(session, repository);
        return;
      }
      case 'openRepository': {
        const recent = storage.recent.find((root) =>
          sameRoot(root, message.root),
        );
        if (recent !== undefined) {
          await this.worktrees.openRepositories(session, [recent], true);
        }
        return;
      }
      case 'browseRepositories':
        await this.worktrees.openRepositories(
          session,
          await this.host.chooseFolders(),
        );
        return;
      case 'initRepository': {
        const folder = await this.host.chooseFolder('init');
        if (folder !== undefined) {
          await this.inits.initIn(session, folder);
        }
        return;
      }
      case 'initInside':
        await this.inits.initInside(session, message.folder);
        return;
      case 'openClone':
      case 'closeClone':
      case 'chooseCloneFolder':
      case 'checkCloneTarget':
      case 'clone':
      case 'stopClone':
        sessions.cloningIn = session;
        await this.clones.receive(message);
        return;
      case 'forgetRecent':
        await this.storage.removeRecent(message.root);
        await this.worktrees.forgetUnused([message.root]);
        this.posts.sendRecentEverywhere();
        return;
      case 'preloadWorktree': {
        const repository = sessions.activeRepositoryIn(session);
        const root = sessions.knownRoot(message.root);
        if (
          repository !== undefined &&
          sameRoot(sessions.repositoryOf(root), repository) &&
          !sessions.isActiveIn(session, root)
        ) {
          await this.preloadRoot(session, root, repository);
        }
        return;
      }
      case 'setColumnWidths':
      case 'setShowAllFiles':
      case 'setCollapseMerges':
      case 'setShowEntireFile':
      case 'setAutoFetch':
      case 'setDiffLayout':
      case 'setIgnoreWhitespace':
        await this.viewSettings.receive(session, message);
        return;
      case 'loadCompareTexts':
        await this.compareTabs.sendCompareTexts(session, message.requests);
        return;
      case 'setSolo':
      case 'setBookmarks':
        await this.choices.receive(session, message);
        return;
      case 'scrolled': {
        const tab = this.tabStates.get(sessions.knownRoot(message.root));
        if (tab) {
          tab.anchor = {
            hash: message.hash,
            offset: message.offset,
            report: message.report,
          };
        }
        return;
      }
      case 'searchCommits':
        await this.commitNavigation.searchCommits(
          session,
          sessions.knownRoot(message.root),
          message.query,
        );
        return;
      case 'stopCommitSearch':
        this.commitNavigation.commitSearches
          .get(sessions.knownRoot(message.root))
          ?.abort();
        return;
      default:
        if (sessions.isActiveIn(session, message.root)) {
          await this.handleTab(message, session);
        }
    }
  }

  private async handleTab(
    message: Exclude<
      TabMessage,
      {
        type:
          | 'setBookmarks'
          | 'setSolo'
          | 'scrolled'
          | 'searchCommits'
          | 'stopCommitSearch';
      }
    >,
    session: Session,
  ): Promise<void> {
    const context = await this.contexts.context(session);
    if (!context) {
      return;
    }
    const picked = context.tab.selection;
    const { loadingHistory } = context.tab;
    if (loadingHistory && !needsNoWholeHistory(context.tab, message)) {
      await loadingHistory;
    }
    switch (message.type) {
      case 'loadCommits':
        await this.refreshes.sendCommitPage(
          context,
          message.generation,
          message.start,
          message.count,
        );
        break;
      case 'toggleMerge':
        if (context.tab.fullHistory.isMerge(message.hash)) {
          toggleMerges(context.tab, [message.hash]);
          await this.refreshes.sendShownHistory(context, {
            scrollTo: message.hash,
          });
        }
        break;
      case 'checkout':
      case 'fetch':
      case 'pull':
      case 'push':
      case 'pushTag':
      case 'pullBranch':
      case 'pushBranch':
        await this.remotes.receive(context, message, picked);
        break;
      case 'jump':
      case 'showUpstream':
      case 'showParent':
      case 'navigate':
      case 'lookupHash':
        await this.commitNavigation.receive(context, message, picked);
        break;
      case 'selectCommit':
      case 'selectFile':
      case 'loadTree':
      case 'loadTexts':
      case 'prefetchDiff':
      case 'prefetchTexts':
      case 'loadFileDiff':
        await this.selections.receive(context, message);
        break;
      case 'viewFile':
        await this.fileViews.viewFile(context, message.path, message.blob);
        break;
    }
  }

  private async showTab(context: Context): Promise<void> {
    const { tab } = context;
    const resend = tab.diffStale && tab.opened;
    tab.diffStale = false;
    if (resend && tab.hash !== undefined) {
      await this.diffs.sendDiff(context, tab.hash);
    }
    const firstOpen = !context.tab.opened;
    context.tab.opened = true;
    if (!firstOpen && context.tab.shown.commits) {
      this.log.info(strings.log.tabShownAsLeft(context.root));
      await this.posts.addDefaultBookmarks(context);
      await this.refreshes.refresh(context);
      return;
    }
    await this.loadTab(context);
  }

  private save(saving: Promise<void>): void {
    void saving.catch((error: unknown) => {
      this.log.error(strings.log.savingFailed);
      this.log.error(error);
    });
  }

  private async loadTab(context: Context): Promise<void> {
    const refs = this.contexts.refsOf(context);
    await allSettled([
      this.posts.addDefaultBookmarks(context, refs),
      this.refreshes.refresh(context, () => {
        context.tab.indexPaths = undefined;
        return allSettled([
          (async () => {
            if (!historyLoaded(context.tab)) {
              await this.refreshes.sendCommits(context, refs);
            } else if (context.tab.shownStale) {
              await this.refreshes.sendShownHistory(context, {
                keepPlace: true,
              });
            }
            await this.diffs.sendCommit(context);
          })(),
          this.refreshes.sendWorkingTree(context),
        ]);
      }),
      this.posts.sendRepository(context, refs),
    ]);
  }

  private async preloadRoot(
    session: Session,
    root: string,
    repository: string,
  ): Promise<void> {
    this.repositories.set(root, repository);
    const tab = this.contexts.tabState(root);
    if (tab.opened || tab.preloading) {
      return;
    }
    const selected = { hash: tab.hash, path: tab.path, area: tab.area };
    tab.preloading = (async () => {
      try {
        const context = await this.contexts.context(session, root, false);
        if (!context || tab.opened) {
          return;
        }
        this.log.info(strings.log.preloading(root));
        tab.opened = true;
        await this.loadTab(context);
      } catch (error) {
        Object.assign(tab, newTabState(), selected);
        this.log.error(strings.log.preloadingFailed(root));
        this.log.error(error);
      } finally {
        tab.preloading = undefined;
      }
    })();
    await tab.preloading;
  }
}
