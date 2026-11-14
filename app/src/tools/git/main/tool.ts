import { AutoFetch, fetchOrder, type Timer } from './autoFetch';
import { remoteDefaultBranches } from './cli/branches';
import { gitErrorText } from './cli/errorText';
import { keptGits } from './cli/run';
import { comparedImage, comparedNames } from './cli/compare';
import { readImage, viewedFile } from './cli/files';
import { findCommit } from './cli/history';
import {
  hasGitFolder,
  initRepository,
  isFolder,
  readRefs,
  repositoryRoot,
  type Refs,
} from './cli/repository';
import { UntrackedPatches } from './cli/workingTree';
import { locateRepository, type Location } from './cli/worktrees';
import { ImageReads } from './imageReads';
import { Clones } from './clones';
import type { Log } from '../../../shell/main/log';
import { tagRemoteOf, type Notify } from './operations';
import { defaultBookmarks, remoteTagRefs } from './refs';
import { isFullHash } from '../shared/hashes';
import { bookmarkedCommits } from '../shared/refNames';
import { imageSourceOf, imageType } from '../shared/images';
import type { TabMessage, GitToHost, WorktreeInfo } from '../shared/protocol';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type ShownTab,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/shell';
import { strings } from '../../../lib/shared/strings';
import { sameRoot } from '../../../shell/main/storage';
import type { GitStorage } from './storage';
import {
  forgetHistory,
  historyLoaded,
  keep,
  newTabState,
  parentOf,
  pickable,
  select,
  stillThere,
  toggleMerges,
  unselect,
  type TabState,
} from './tabState';
import {
  type TabWork,
  type ReadRefs,
  type GitPost,
  type Session,
  type Context,
  notInHistory,
  nothing,
  allSettled,
  type GitCore,
  OpeningFailed,
} from './tabContext';
import { Diffs } from './diffs';
import { Refreshes } from './refreshes';
import { Navigation } from './navigation';
import { Remotes } from './remotes';
import { Watching } from './watching';
import { CompareTabs } from './compareTabs';
import { needsNoWholeHistory, wellFormed } from './messageChecks';
import { Worktrees } from './worktrees';
import { tabInfos, tabName } from './tabNames';

const maxKeptUntrackedChars = 32_000_000;
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
  private readonly sessions = new WeakMap<Page, Session>();
  private cloningIn: Session | undefined;
  private readonly tabStates = new Map<string, TabWork>();
  private readonly repositories = new Map<string, string>();
  private readonly worktreeLists = new Map<string, readonly WorktreeInfo[]>();
  private readonly imageReads = new ImageReads();
  private readonly autoFetch: AutoFetch;
  private readonly quitting = new AbortController();
  private readonly clones: Clones;
  private collapseMerges: boolean;
  private soloDefault: boolean;
  private initAsked: string | undefined;
  private readonly core: GitCore;
  private readonly diffs: Diffs;
  private readonly refreshes: Refreshes;
  private readonly navigation: Navigation;
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
    this.collapseMerges = storage.collapseMerges;
    this.soloDefault = storage.soloDefault;
    this.core = {
      context: (session, root, live) => this.context(session, root, live),
      run: (failed, session, action, root) =>
        this.run(failed, session, action, root),
      live: (session) => this.live(session),
      page: () => this.page,
      sessionShowing: (root) => this.sessionShowing(root),
      sessionShowingRepository: (repository) =>
        this.sessionShowingRepository(repository),
      isActiveIn: (session, root) => this.isActiveIn(session, root),
      hasRepository: (root) => this.hasRepository(root),
      notify: (context) => this.notify(context),
      noticesOf: (session, repository) => this.noticesOf(session, repository),
      refsOf: (context) => this.refsOf(context),
      sendRepository: (context, refs) => this.sendRepository(context, refs),
      rememberSelection: (context) => this.rememberSelection(context),
      save: (saving) => this.save(saving),
    };
    this.diffs = new Diffs(storage, () => this.shell);
    this.refreshes = new Refreshes(log, storage, () => this.shell, this.diffs, {
      live: (session) => this.live(session),
      refsOf: (context) => this.refsOf(context),
      sendRepository: (context, refs) => this.sendRepository(context, refs),
      rememberSelection: (context) => this.rememberSelection(context),
      bookmarkedOf: (repository) => this.bookmarkedOf(repository),
      sendNavigation: (context, current) =>
        this.navigation.sendNavigation(context, current),
    });
    this.navigation = new Navigation(
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
      this.navigation,
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
      this.navigation,
      this.tabStates,
      this.repositories,
      this.worktreeLists,
      {
        repositoryTabs: () => this.repositoryTabs,
        repositoryOf: (root) => this.repositoryOf(root),
        isActive: (root) => this.isActive(root),
        tabState: (root) => this.tabState(root),
        showTab: (context) => this.showTab(context),
        postTabs: (session) => this.postTabs(session),
        sendTabs: (session) => this.sendTabs(session),
        sendRecentEverywhere: () => this.sendRecentEverywhere(),
      },
    );
    this.autoFetch = new AutoFetch(
      () => storage.autoFetchMinutes,
      () => fetchOrder(this.repositoryTabs, this.shownRepositories()),
      (root) => this.shell.track(this.remotes.fetchInBackground(root)),
      timer,
    );
    this.autoFetch.update();
    this.clones = new Clones(
      log,
      gitPath,
      {
        post: (message) => this.cloneSession()?.post(message),
        open: async (target) => {
          const session = this.cloneSession();
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
    const collapseChanged = this.storage.collapseMerges !== this.collapseMerges;
    const soloChanged = this.storage.soloDefault !== this.soloDefault;
    this.collapseMerges = this.storage.collapseMerges;
    this.soloDefault = this.storage.soloDefault;
    for (const tab of this.tabStates.values()) {
      if (soloChanged) {
        forgetHistory(tab);
      } else {
        tab.shownStale = true;
      }
      tab.opened = false;
      if (collapseChanged) {
        tab.toggledMerges.clear();
      }
    }
    this.sendRecentEverywhere();
  }

  attach(shell: ShellAccess): void {
    this.shell = shell;
  }

  ready(page: Page): void {
    if (
      this.cloningIn === undefined ||
      this.live(this.cloningIn) === undefined
    ) {
      this.clones.pageLoaded();
    }
    const session = this.sessionOf(page);
    session.post(this.storage.layout);
    this.sendRecent(session);
  }

  async show(page: Page, tab: Tab): Promise<void> {
    const session = this.sessionOf(page);
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
    return this.showsActiveTab(this.sessionOf(page));
  }

  hide(page: Page): void {
    const session = this.sessionOf(page);
    this.compareTabs.stopComparing(session);
    this.watching.stopWatching(session);
    this.postTabs(session);
  }

  async preload(page: Page, tab: Tab): Promise<void> {
    const { root } = tab;
    if (root === undefined) {
      return;
    }
    const session = this.sessionOf(page);
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
      if (sameRoot(this.repositoryOf(root), closed)) {
        this.worktrees.forgetTab(root, state);
      }
    }
    this.save(this.worktrees.forgetUnused([closed]));
    this.sendRecentEverywhere();
  }

  receive(page: Page, message: GitToHost): Promise<void> {
    if (!wellFormed(message)) {
      return Promise.resolve();
    }
    const session = this.sessionOf(page);
    return this.run(
      strings.log.handlingFailed(message.type),
      session,
      () => this.handle(message, session),
      this.worktreeAsked(message),
    );
  }

  refreshShown(page: Page): Promise<void> {
    const session = this.sessionOf(page);
    return this.run(
      strings.log.refreshingFailed,
      session,
      async () => {
        const context = await this.context(session);
        if (context) {
          await this.refreshes.refresh(context);
        }
      },
      this.activeWorktreeIn(session),
    );
  }

  names(tabs: readonly Tab[]): ReadonlyMap<string, TabName> {
    const infos = tabInfos(tabs.flatMap((tab) => tab.root ?? []));
    return new Map(
      tabs.flatMap((tab): [string, TabName][] => {
        if (tab.compare !== undefined) {
          return [
            [
              tab.id,
              {
                name: strings.messages.compareTab(
                  ...comparedNames(tab.compare),
                ),
              },
            ],
          ];
        }
        const info = infos.find((other) => other.root === tab.root);
        return info === undefined
          ? []
          : [
              [
                tab.id,
                {
                  name: info.name,
                  ...(info.folder !== undefined && { folder: info.folder }),
                },
              ],
            ];
      }),
    );
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
    const session = this.sessionOf(page);
    return this.run(strings.log.openingAskedFailed, session, () =>
      this.worktrees.openRepositories(session, folders),
    );
  }

  newTab(page: Page): Promise<void> {
    const session = this.sessionOf(page);
    return this.run(strings.log.openingAskedFailed, session, async () =>
      this.worktrees.openRepositories(session, await this.host.chooseFolders()),
    );
  }

  idle(): Promise<void> {
    return this.shell.idle();
  }

  private sessionOf(page: Page): Session {
    const known = this.sessions.get(page);
    if (known !== undefined) {
      return known;
    }
    const session: Session = {
      page,
      post: (message) => {
        if (message.type === 'notice') {
          this.shell.notice(page, {
            level: message.level,
            message: message.message,
          });
        } else {
          page.post({ type: 'tool', tool: 'git', message });
        }
      },
      get disposed() {
        return page.disposed;
      },
      watcher: undefined,
      watching: undefined,
    };
    this.sessions.set(page, session);
    return session;
  }

  private get page(): Session | undefined {
    const page = this.shell.page();
    return page === undefined ? undefined : this.sessionOf(page);
  }

  private get repositoryTabs(): string[] {
    return this.shell
      .tabs()
      .flatMap((tab) =>
        tab.tool === 'git' && tab.root !== undefined ? [tab.root] : [],
      );
  }

  private activeRepositoryIn(session: Session): string | undefined {
    const active = this.shell.active(session.page);
    return active?.tool === 'git' ? active.root : undefined;
  }

  private activeWorktreeIn(session: Session): string | undefined {
    const repository = this.activeRepositoryIn(session);
    return repository === undefined
      ? undefined
      : this.storage.worktreeOf(repository);
  }

  private shownRepositories(): string[] {
    return this.shell
      .shown()
      .flatMap(({ tab }) =>
        tab.tool === 'git' && tab.root !== undefined ? [tab.root] : [],
      );
  }

  private sessionShowingRepository(repository: string): Session | undefined {
    const shown = this.shell
      .shown()
      .find(
        ({ tab }) =>
          tab.tool === 'git' &&
          tab.root !== undefined &&
          sameRoot(tab.root, repository),
      );
    return shown?.page === undefined ? undefined : this.sessionOf(shown.page);
  }

  private showing(root: string): ShownTab | undefined {
    return this.shell
      .shown()
      .find(
        ({ tab }) =>
          tab.tool === 'git' &&
          tab.root !== undefined &&
          sameRoot(this.storage.worktreeOf(tab.root), root),
      );
  }

  private sessionShowing(root: string): Session | undefined {
    const shown = this.showing(root);
    return shown?.page === undefined ? undefined : this.sessionOf(shown.page);
  }

  private live(session: Session): Session | undefined {
    const page = this.shell.current(session.page);
    return page === undefined ? undefined : this.sessionOf(page);
  }

  private cloneSession(): Session | undefined {
    const kept =
      this.cloningIn === undefined ? undefined : this.live(this.cloningIn);
    return kept ?? this.page;
  }

  private sendRecentEverywhere(): void {
    for (const page of this.shell.pages()) {
      this.sendRecent(this.sessionOf(page));
    }
  }

  private hasRepository(root: string): boolean {
    return this.repositoryTabs.some((open) => sameRoot(open, root));
  }

  private async viewFile(
    context: Context,
    file: string,
    blob: string | undefined,
  ): Promise<void> {
    const page = context.session?.page;
    if (page === undefined) {
      return;
    }
    const notify = this.notify(context);
    try {
      const viewed = await viewedFile(
        this.gitPath,
        context.root,
        file,
        blob,
        this.host.viewedFiles,
      );
      if (viewed.kind === 'file') {
        await this.shell.openView(page, 'commander', viewed.file);
      } else {
        notify(
          'error',
          viewed.kind === 'tooLarge'
            ? strings.diff.viewTooLarge(file)
            : strings.diff.viewMissing(file),
        );
      }
    } catch (error) {
      notify('error', strings.diff.couldNotView(file, gitErrorText(error)));
    }
  }

  image(url: URL): Promise<Response> {
    return this.shell.track(this.readImage(url));
  }

  private async readImage(url: URL): Promise<Response> {
    const source = imageSourceOf(url);
    const type = source && imageType(source.path);
    const tab = source && this.tabStates.get(source.root);
    const compared =
      source && this.compareTabs.comparisons.get(source.root)?.compared;
    if (
      !source ||
      !type ||
      (tab?.isRepository !== true && compared === undefined)
    ) {
      return new Response(null, { status: 404 });
    }
    try {
      const read = await this.imageReads.read(source, (limit) =>
        compared === undefined
          ? readImage(this.gitPath, source.root, source, limit)
          : comparedImage(compared, source.path, source.id, limit),
      );
      if (read.kind !== 'image') {
        return new Response(null, {
          status: read.kind === 'tooLarge' ? 413 : 404,
        });
      }
      const { buffer, byteOffset, byteLength } = read.bytes;
      const body =
        buffer instanceof ArrayBuffer
          ? new Uint8Array(buffer, byteOffset, byteLength)
          : new Uint8Array(read.bytes);
      return new Response(body, {
        headers: { 'content-type': type, 'cache-control': 'no-store' },
      });
    } catch (error) {
      this.log.error(strings.log.readingImageFailed(source.path));
      this.log.error(error instanceof Error ? error : gitErrorText(error));
      return new Response(null, { status: 500 });
    }
  }

  private isActive(root: string): boolean {
    return this.showing(root) !== undefined;
  }

  private isActiveIn(session: Session, root: string): boolean {
    const active = this.activeWorktreeIn(session);
    return active !== undefined && sameRoot(active, root);
  }

  private showsActiveTab(session: Session): boolean {
    const active = this.activeWorktreeIn(session);
    return (
      !session.disposed &&
      active !== undefined &&
      this.tabStates.get(active)?.isRepository !== false &&
      this.tabStates.get(active)?.refused !== true
    );
  }

  private repositoryOf(root: string): string {
    return this.repositories.get(root) ?? root;
  }

  private knownRoot(root: string): string {
    return (
      [
        ...this.tabStates.keys(),
        ...this.repositories.keys(),
        ...this.repositoryTabs,
      ].find((known) => sameRoot(known, root)) ?? root
    );
  }

  private bookmarkedOf(repository: string): Set<string> {
    return bookmarkedCommits(this.storage.bookmarksOf(repository) ?? []);
  }

  private async showBookmarked(
    session: Session,
    repository: string,
  ): Promise<void> {
    for (const [root, tab] of this.tabStates) {
      if (this.repositoryOf(root) !== repository || !historyLoaded(tab)) {
        continue;
      }
      const shownIn = this.sessionShowing(root);
      if (shownIn === undefined) {
        tab.shownStale = true;
        continue;
      }
      const context = await this.context(shownIn, root);
      if (context) {
        await tab.loadingHistory;
        await this.refreshes.sendShownHistory(context, {
          keepPlace: true,
          layOut: false,
        });
      }
    }
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
      if (root === undefined || this.isActiveIn(session, root)) {
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
    const { storage } = this;
    switch (message.type) {
      case 'selectWorktree': {
        const repository = this.activeRepositoryIn(session);
        const root = this.knownRoot(message.root);
        if (
          repository === undefined ||
          !sameRoot(this.repositoryOf(root), repository) ||
          (this.isActiveIn(session, root) && this.showsActiveTab(session))
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
          await this.initIn(session, folder);
        }
        return;
      }
      case 'initInside': {
        const asked = this.initAsked;
        if (asked !== undefined && sameRoot(asked, message.folder)) {
          this.initAsked = undefined;
          await this.initAndOpen(session, asked);
        }
        return;
      }
      case 'openClone':
      case 'closeClone':
      case 'chooseCloneFolder':
      case 'checkCloneTarget':
      case 'clone':
      case 'stopClone':
        this.cloningIn = session;
        await this.clones.receive(message);
        return;
      case 'forgetRecent':
        await this.storage.removeRecent(message.root);
        await this.worktrees.forgetUnused([message.root]);
        this.sendRecentEverywhere();
        return;
      case 'preloadWorktree': {
        const repository = this.activeRepositoryIn(session);
        const root = this.knownRoot(message.root);
        if (
          repository !== undefined &&
          sameRoot(this.repositoryOf(root), repository) &&
          !this.isActiveIn(session, root)
        ) {
          await this.preloadRoot(session, root, repository);
        }
        return;
      }
      case 'setColumnWidths':
        this.save(storage.setColumnWidths(message.widths));
        return;
      case 'setShowAllFiles':
        this.save(storage.setShowAllFiles(message.show));
        return;
      case 'setCollapseMerges': {
        this.save(storage.setCollapseMerges(message.collapse));
        this.collapseMerges = message.collapse;
        for (const tab of this.tabStates.values()) {
          tab.toggledMerges.clear();
          tab.shownStale = true;
        }
        const context = await this.context(session);
        if (context) {
          await this.refreshes.sendShownHistory(context);
        }
        return;
      }
      case 'loadCompareTexts':
        await this.compareTabs.sendCompareTexts(session, message.requests);
        return;
      case 'setShowEntireFile': {
        this.save(storage.setShowEntireFile(message.show));
        await this.compareTabs.sendCompare(session);
        const context = await this.context(session);
        this.staleDiffs(context, (tab) => tab.path !== undefined);
        if (context?.tab.hash !== undefined && context.tab.path !== undefined) {
          await this.diffs.sendDiff(context, context.tab.hash);
        }
        return;
      }
      case 'setAutoFetch':
        this.save(storage.setAutoFetch(message.on));
        this.autoFetch.update(message.on);
        return;
      case 'setDiffLayout':
        this.save(storage.setDiffLayout(message.layout));
        return;
      case 'setIgnoreWhitespace': {
        this.save(storage.setIgnoreWhitespace(message.ignore));
        await this.compareTabs.sendCompare(session);
        const context = await this.context(session);
        this.staleDiffs(context, () => true);
        if (context?.tab.hash !== undefined) {
          await this.diffs.sendDiff(context, context.tab.hash);
        }
        return;
      }
      case 'setSolo': {
        const root = this.knownRoot(message.root);
        if (!this.hasRepository(this.repositoryOf(root))) {
          return;
        }
        const context = await this.context(session, root);
        this.save(storage.setSolo(root, message.solo));
        if (!context) {
          return;
        }
        context.post({ type: 'solo', solo: message.solo });
        context.post({ type: 'applyingSolo', running: true });
        try {
          forgetHistory(context.tab);
          context.tab.readingHistory?.abort();
          if (this.isActiveIn(session, root)) {
            await this.refreshes.refresh(context, () =>
              this.refreshes.sendCommits(context, this.refsOf(context), true),
            );
          }
        } finally {
          context.post({ type: 'applyingSolo', running: false });
        }
        return;
      }
      case 'setBookmarks': {
        const repository = this.repositoryOf(this.knownRoot(message.root));
        if (!this.hasRepository(repository)) {
          return;
        }
        const before = this.bookmarkedOf(repository);
        this.save(
          storage.setBookmarks(
            repository,
            message.bookmarks.map(({ kind, name }) => ({ kind, name })),
          ),
        );
        const after = this.bookmarkedOf(repository);
        if (
          before.size !== after.size ||
          [...before].some((hash) => !after.has(hash))
        ) {
          await this.showBookmarked(session, repository);
        }
        return;
      }
      case 'scrolled': {
        const tab = this.tabStates.get(this.knownRoot(message.root));
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
        await this.navigation.searchCommits(
          session,
          this.knownRoot(message.root),
          message.query,
        );
        return;
      case 'stopCommitSearch':
        this.navigation.commitSearches
          .get(this.knownRoot(message.root))
          ?.abort();
        return;
      default:
        if (this.isActiveIn(session, message.root)) {
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
    const context = await this.context(session);
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
        await this.remotes.checkout(context, message.target, picked);
        break;
      case 'fetch':
        await this.remotes.fetch(context);
        break;
      case 'pull':
        await this.remotes.pull(context, picked);
        break;
      case 'push':
        await this.remotes.push(context);
        break;
      case 'pushTag':
        await this.remotes.pushTag(context, message.name);
        break;
      case 'pullBranch':
        await this.remotes.pullBranch(context, message.name, picked);
        break;
      case 'pushBranch':
        await this.remotes.pushBranch(context, message.name);
        break;
      case 'loadTree':
        if (this.isSelected(context, message.hash)) {
          await this.diffs.sendTree(context, message.hash);
        }
        break;
      case 'jump': {
        if (isFullHash(message.hash)) {
          await this.navigation.showCommit(
            context,
            message.hash.toLowerCase(),
            picked,
          );
          break;
        }
        const found = await findCommit(
          context.gitPath,
          context.root,
          message.hash,
        );
        if (found.kind === 'found') {
          await this.navigation.showCommit(context, found.hash, picked);
        } else {
          this.notify(context)(
            'error',
            found.kind === 'ambiguous'
              ? strings.search.commitsStartWith(found.count, message.hash)
              : strings.search.noCommitStartsWith(message.hash),
          );
        }
        break;
      }
      case 'showUpstream':
        await this.navigation.showUpstream(context, picked);
        break;
      case 'showParent': {
        const parent = parentOf(context.tab);
        if (parent !== undefined) {
          await this.navigation.showCommit(context, parent, picked);
        }
        break;
      }
      case 'navigate':
        await this.navigation.navigate(
          context,
          message.direction,
          message.steps,
          picked,
        );
        break;
      case 'lookupHash':
        await this.navigation.lookupHash(context, message.query);
        break;
      case 'selectCommit':
        context.tab.prefetching?.controller.abort();
        context.tab.selection = message.selection;
        if (message.hash === undefined) {
          unselect(context.tab);
          this.rememberSelection(context);
          break;
        }
        if (!pickable(context.tab, message.hash)) {
          notInHistory(context, message.hash);
          break;
        }
        this.navigation.visit(context, message.hash, message.replace);
        select(context.tab, message.hash);
        this.rememberSelection(context);
        await this.diffs.sendCommit(context);
        break;
      case 'selectFile':
        if (this.isSelected(context, message.hash)) {
          context.tab.path = message.path;
          context.tab.area = message.area;
          this.rememberSelection(context);
          await this.diffs.sendDiff(context, message.hash);
        }
        break;
      case 'loadTexts':
        if (this.isSelected(context, message.hash)) {
          await this.diffs.sendTexts(context, message);
        }
        break;
      case 'prefetchDiff':
        await this.diffs.prefetchDiff(context, message.hash);
        break;
      case 'prefetchTexts':
        if (context.tab.prefetching?.hash === message.hash) {
          await this.diffs.prefetchTexts(context, message.hash, message.texts);
        }
        break;
      case 'viewFile':
        await this.viewFile(context, message.path, message.blob);
        break;
      case 'loadFileDiff':
        if (this.isSelected(context, message.hash)) {
          await this.diffs.sendFileDiff(
            context,
            message.hash,
            message.path,
            message.diff,
          );
        }
        break;
    }
  }

  private known(context: Context, hash: string): boolean {
    if (stillThere(context.tab)(hash)) {
      return true;
    }
    notInHistory(context, hash);
    return false;
  }

  private isSelected(context: Context, hash: string): boolean {
    return this.known(context, hash) && hash === context.tab.hash;
  }

  initRepositoryIn(folder: string): Promise<void> {
    const session = this.page;
    return session === undefined
      ? Promise.resolve()
      : this.initIn(session, folder);
  }

  cloneInto(folder: string): Promise<void> {
    this.cloningIn = this.page;
    return this.clones.openIn(folder);
  }

  private async initIn(session: Session, folder: string): Promise<void> {
    let location: Location | undefined;
    try {
      location = (await isFolder(folder))
        ? await locateRepository(this.gitPath, folder)
        : undefined;
    } catch (error) {
      this.initFailed(session, folder, error);
      return;
    }
    if (location === undefined) {
      await this.initAndOpen(session, folder);
      return;
    }
    const { worktree } = location;
    if (worktree === undefined || sameRoot(worktree, folder)) {
      session.post({
        type: 'notice',
        level: 'info',
        message: strings.messages.alreadyRepository(folder),
      });
      await this.worktrees.openRepositories(session, [folder]);
      return;
    }
    this.initAsked = folder;
    session.post({ type: 'confirmInit', folder, repository: worktree });
  }

  private async initAndOpen(session: Session, folder: string): Promise<void> {
    try {
      await initRepository(this.gitPath, folder);
    } catch (error) {
      this.initFailed(session, folder, error);
      return;
    }
    this.log.info(strings.log.initialized(folder));
    await this.worktrees.openRepositories(session, [folder]);
  }

  private initFailed(session: Session, folder: string, error: unknown): void {
    const text = gitErrorText(error);
    this.log.error(strings.log.initFailed(folder));
    this.log.error(error instanceof Error ? error : text);
    session.post({
      type: 'notice',
      level: 'error',
      message: strings.messages.couldNotInit(folder, text),
    });
  }

  private staleDiffs(
    active: Context | undefined,
    affected: (tab: TabState) => boolean,
  ): void {
    for (const tab of this.tabStates.values()) {
      if (tab !== active?.tab && tab.hash !== undefined && affected(tab)) {
        tab.diffStale = true;
      }
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
      await this.addDefaultBookmarks(context);
      await this.refreshes.refresh(context);
      return;
    }
    await this.loadTab(context);
  }

  private rememberSelection({ root, tab }: Context): void {
    this.save(
      this.storage.setSelection(
        root,
        tab.hash === undefined
          ? undefined
          : { hash: tab.hash, path: tab.path, area: tab.area },
      ),
    );
  }

  private save(saving: Promise<void>): void {
    void saving.catch((error: unknown) => {
      this.log.error(strings.log.savingFailed);
      this.log.error(error);
    });
  }

  private async loadTab(context: Context): Promise<void> {
    const refs = this.refsOf(context);
    await allSettled([
      this.addDefaultBookmarks(context, refs),
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
      this.sendRepository(context, refs),
    ]);
  }

  private async preloadRoot(
    session: Session,
    root: string,
    repository: string,
  ): Promise<void> {
    this.repositories.set(root, repository);
    const tab = this.tabState(root);
    if (tab.opened || tab.preloading) {
      return;
    }
    const selected = { hash: tab.hash, path: tab.path, area: tab.area };
    tab.preloading = (async () => {
      try {
        const context = await this.context(session, root, false);
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

  private async sendRepository(
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

  private postTabs(session: Session): void {
    const { storage } = this;
    const active = this.activeRepositoryIn(session);
    const worktree = this.activeWorktreeIn(session);
    this.sendTabs(session);
    session.post({
      type: 'bookmarks',
      bookmarks: active ? (storage.bookmarksOf(active) ?? []) : [],
    });
    session.post({
      type: 'solo',
      solo: worktree !== undefined && storage.soloOf(worktree),
    });
    this.remotes.postLastFetch(session, active);
  }

  private sendTabs(session: Session): void {
    const active = this.activeRepositoryIn(session);
    session.post({
      type: 'worktrees',
      worktree: this.activeWorktreeIn(session),
      worktrees: active === undefined ? [] : this.worktreeLists.get(active),
    });
    this.sendRecent(session);
  }

  private sendRecent(session: Session): void {
    session.post({
      type: 'recent',
      recent: tabInfos(
        this.storage.recent
          .filter(
            (root) =>
              !this.hasRepository(root) &&
              !this.hasRepository(this.repositoryOf(root)),
          )
          .slice(0, this.shell.recentFolders()),
      ),
    });
  }

  private async addDefaultBookmarks(
    context: Context,
    refs?: Promise<Refs>,
  ): Promise<void> {
    const saved = this.storage.bookmarksOf(context.repository);
    if (saved !== undefined) {
      context.post({ type: 'bookmarks', bookmarks: saved });
      return;
    }
    const [{ head, refs: listed }, defaults] = await Promise.all([
      refs ?? this.refsOf(context),
      remoteDefaultBranches(context.gitPath, context.root),
    ]);
    const bookmarks = defaultBookmarks(listed, defaults);
    if (head?.commit !== undefined) {
      this.save(this.storage.setBookmarks(context.repository, bookmarks));
    }
    context.post({ type: 'bookmarks', bookmarks });
  }

  private tabState(root: string): TabWork {
    let tab = this.tabStates.get(root);
    if (!tab) {
      const saved = this.storage.selectionOf(root);
      tab = {
        ...newTabState(),
        hash: saved?.hash,
        path: saved?.path,
        area: saved?.area,
        preloading: undefined,
        loadingHistory: undefined,
        readingHistory: undefined,
        refreshing: false,
        refreshAgain: new Map(),
        changedAgain: nothing,
        refreshedAgain: undefined,
        loadsAgain: [],
        refreshError: undefined,
        isRepository: undefined,
        refused: false,
        selection: undefined,
        navigating: Promise.resolve(),
        movingHead: Promise.resolve(),
        runningOn: {
          pushingTag: new Set(),
          pullingBranch: new Set(),
          pushingBranch: new Set(),
        },
        diffRequest: 0,
        diffOwed: false,
        loadingFiles: new AbortController(),
        loadingDiff: new AbortController(),
        prefetching: undefined,
        closed: new AbortController(),
        untrackedPatches: new UntrackedPatches(maxKeptUntrackedChars),
        indexPaths: undefined,
        refsRead: 0,
        repositoryShown: 0,
      };
      this.tabStates.set(root, tab);
    }
    return tab;
  }

  private async refsOf(context: Context): Promise<ReadRefs> {
    const read = ++context.tab.refsRead;
    const refs = await readRefs(context.gitPath, context.root);
    return {
      ...refs,
      read,
      refs: [
        ...refs.refs,
        ...remoteTagRefs(
          this.storage.remoteTagsOf(context.repository),
          refs.remotes,
        ),
      ],
    };
  }

  private async context(
    session: Session,
    root = this.activeWorktreeIn(session),
    live = true,
  ): Promise<Context | undefined> {
    if (!root) {
      return undefined;
    }
    const tab = this.tabState(root);
    tab.isRepository ||=
      (await repositoryRoot(this.gitPath, root)) !== undefined;
    if (!tab.isRepository) {
      if (live && this.isActiveIn(session, root)) {
        tab.refreshError = strings.messages.notRepository(root);
        session.post({ type: 'error', message: tab.refreshError });
      }
      return undefined;
    }
    return {
      gitPath: this.gitPath,
      root,
      repository: this.repositoryOf(root),
      tab,
      session: live ? session : undefined,
      post: (message) => {
        if (message.type !== 'notice') {
          keep(tab.shown, message);
        }
        if (this.tabStates.get(root) !== tab) {
          return;
        }
        const shownIn = this.isActiveIn(session, root)
          ? session
          : this.sessionShowing(root);
        if (shownIn !== undefined) {
          this.postToPage(shownIn, message);
        }
      },
    };
  }

  private notify(context: Context): Notify {
    const elsewhere =
      context.session && this.noticesOf(context.session, context.repository);
    return (level, message) => {
      if (elsewhere && !this.isActive(context.root)) {
        elsewhere(level, message);
      } else {
        context.post({ type: 'notice', level, message });
      }
    };
  }

  private noticesOf(session: Session, repository: string): Notify {
    return (level, message) =>
      this.hasRepository(repository) &&
      this.postToPage(session, {
        type: 'notice',
        level,
        message: strings.messages.inTab(this.tabLabel(repository), message),
      });
  }

  private tabLabel(repository: string): string {
    const tab = tabInfos(this.repositoryTabs).find((info) =>
      sameRoot(info.root, repository),
    );
    return strings.tabs.label(tab?.name ?? tabName(repository), tab?.folder);
  }

  private postToPage(session: Session, message: GitPost): void {
    if (message.type === 'notice') {
      this.shell.notice(session.page, {
        level: message.level,
        message: message.message,
      });
      return;
    }
    this.live(session)?.post(message);
  }
}
