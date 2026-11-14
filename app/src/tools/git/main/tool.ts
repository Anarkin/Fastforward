import * as path from 'node:path';
import { AutoFetch, fetchOrder, type Timer } from './autoFetch';
import { remoteDefaultBranches } from './cli/branches';
import { gitErrorText } from './cli/errorText';
import { keptGits } from './cli/run';
import {
  CompareTooLarge,
  compareMaxBytes,
  comparedFilesPatch,
  comparedImage,
  comparedNames,
  comparedText,
  filesAlike,
} from './cli/compare';
import { watchFiles } from './compareWatch';
import { readImage, viewedFile } from './cli/files';
import { findCommit } from './cli/history';
import {
  hasGitFolder,
  initRepository,
  isFolder,
  readRefs,
  repositoryRoot,
  spellingOf,
  type Refs,
} from './cli/repository';
import { isWatchFailure, watchRepository, type Watcher } from './cli/watch';
import { UntrackedPatches } from './cli/workingTree';
import {
  listWorktrees,
  locateRepository,
  type Location,
  type Worktree,
} from './cli/worktrees';
import { maxSteps } from './history/navigation';
import { ImageReads } from './imageReads';
import { Clones } from './clones';
import type { Log } from '../../../shell/main/log';
import { tagRemoteOf, type Notify } from './operations';
import { defaultBookmarks, remoteTagRefs } from './refs';
import { isFullHash, shortHash } from '../shared/hashes';
import { bookmarkedCommits } from '../shared/refNames';
import { imageSourceOf, imageType } from '../shared/images';
import {
  commitPageSize,
  commitPagesAsked,
  diffLayouts,
  type RepositoryInfo,
  type TabMessage,
  type TextRequest,
  type GitToHost,
  type WorktreeInfo,
} from '../shared/protocol';
import { isColumnWidths } from '../shared/settings';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type ShownTab,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/shell';
import { strings, type Sentence } from '../../../shared/strings';
import {
  maxRecentItems,
  sameRoot,
  type Compared,
} from '../../../shell/main/storage';
import { isBookmark, type GitStorage } from './storage';
import {
  forgetHistory,
  hiddenSides,
  historyLoaded,
  keep,
  newTabState,
  parentOf,
  pickable,
  replayOf,
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
  type Comparing,
  type Context,
  notInHistory,
  uniqueTexts,
  nothing,
  allSettled,
  type GitCore,
} from './tabContext';
import { Diffs } from './diffs';
import { Refreshes } from './refreshes';
import { Navigation } from './navigation';
import { Remotes } from './remotes';

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

const maxBookmarks = 1000;

const maxBookmarkName = 4096;

const maxCommitsAsked = commitPagesAsked * commitPageSize;

const maxTextsAsked = 10_000;

class OpeningFailed {
  constructor(
    readonly root: string,
    readonly error: unknown,
  ) {}
}

export class GitTool implements Tool<'git'> {
  private shell: ShellAccess = unattachedShell;
  private readonly sessions = new WeakMap<Page, Session>();
  private cloningIn: Session | undefined;
  private readonly tabStates = new Map<string, TabWork>();
  private readonly repositories = new Map<string, string>();
  private readonly worktreeLists = new Map<string, readonly WorktreeInfo[]>();
  private readonly worktreeListings = new Map<string, number>();
  private readonly imageReads = new ImageReads();
  private readonly comparisons = new Map<string, Comparing>();
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

  constructor(
    private readonly log: Log,
    private readonly gitPath: string,
    private readonly storage: GitStorage,
    private readonly host: GitHost,
    timer?: Timer,
    private readonly delays: {
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
              this.openRepositories(session, [target]),
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
      await this.showCompare(session, tab.id, tab.compare);
      return;
    }
    this.stopComparing(session);
    const { root } = tab;
    if (root === undefined) {
      return;
    }
    await this.run(
      strings.log.showingTabFailed(root),
      session,
      () => this.openTab(session, root),
      this.storage.worktreeOf(root),
    );
  }

  shows(page: Page): boolean {
    return this.showsActiveTab(this.sessionOf(page));
  }

  hide(page: Page): void {
    const session = this.sessionOf(page);
    this.stopComparing(session);
    this.stopWatching(session);
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
        this.loadWorktrees(session, root),
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
        this.forgetTab(root, state);
      }
    }
    this.save(this.forgetUnused([closed]));
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
      this.openRepositories(session, folders),
    );
  }

  newTab(page: Page): Promise<void> {
    const session = this.sessionOf(page);
    return this.run(strings.log.openingAskedFailed, session, async () =>
      this.openRepositories(session, await this.host.chooseFolders()),
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
    const compared = source && this.comparisons.get(source.root)?.compared;
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
        await this.openTab(session, repository);
        return;
      }
      case 'openRepository': {
        const recent = storage.recent.find((root) =>
          sameRoot(root, message.root),
        );
        if (recent !== undefined) {
          await this.openRepositories(session, [recent], true);
        }
        return;
      }
      case 'browseRepositories':
        await this.openRepositories(session, await this.host.chooseFolders());
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
        await this.forgetUnused([message.root]);
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
        await this.sendCompareTexts(session, message.requests);
        return;
      case 'setShowEntireFile': {
        this.save(storage.setShowEntireFile(message.show));
        await this.sendCompare(session);
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
        await this.sendCompare(session);
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

  private async openRepositories(
    session: Session,
    folders: readonly string[],
    reopened = false,
  ): Promise<void> {
    const page = () => this.live(session) ?? session;
    const repositories = await this.addRepositories(session, folders, reopened);
    this.sendRecentEverywhere();
    await this.shell.open(page().page, 'git', repositories, true);
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
      await this.openRepositories(session, [folder]);
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
    await this.openRepositories(session, [folder]);
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

  private async addRepositories(
    session: Session,
    folders: readonly string[],
    reopened = false,
  ): Promise<string[]> {
    const { storage } = this;
    const page = () => this.live(session) ?? session;
    const repositories: string[] = [];
    for (const folder of folders) {
      let location: Location | undefined;
      try {
        location = await locateRepository(this.gitPath, folder);
      } catch (error) {
        this.log.error(strings.log.openingFailed(folder));
        this.log.error(error instanceof Error ? error : String(error));
        page().post({
          type: 'notice',
          level: 'error',
          message: strings.messages.couldNotOpen(folder, gitErrorText(error)),
        });
        continue;
      }
      if (!location && !(await isFolder(folder))) {
        page().post({
          type: 'notice',
          level: 'error',
          message: strings.messages.couldNotOpen(
            folder,
            strings.messages.unreachable,
          ),
        });
        continue;
      }
      if (!location) {
        this.save(
          storage.removeRecent(folder).then(() => this.forgetUnused([folder])),
        );
        page().post({
          type: 'notice',
          level: 'error',
          message: strings.messages.notInRepository(folder),
        });
        continue;
      }
      const repository = await spellingOf(
        location.repository,
        this.repositoryTabs,
      );
      const usable = this.takeWorktrees(repository, location.worktrees).filter(
        (worktree) => !worktree.bare && !worktree.missing,
      );
      const saved = storage.worktreeOf(repository);
      const picked =
        reopened || location.worktree === undefined
          ? undefined
          : await spellingOf(
              location.worktree,
              usable.map((other) => other.path),
            );
      const worktree =
        picked ??
        usable.find((other) => sameRoot(other.path, saved))?.path ??
        usable[0]?.path;
      if (worktree !== undefined) {
        this.save(storage.setWorktree(repository, worktree));
      }
      repositories.push(repository);
      this.addRecent(repository);
      this.shell.visited(worktree ?? repository);
    }
    return repositories;
  }

  private async openTab(session: Session, active: string): Promise<void> {
    if (session.disposed) {
      return;
    }
    this.postTabs(session);
    const worktree = this.storage.worktreeOf(active);
    this.repositories.set(worktree, active);
    const tab = this.tabState(worktree);
    try {
      await allSettled([
        this.loadWorktrees(session, active),
        this.openWorktree(session, worktree),
      ]);
      tab.refused = false;
    } catch (error) {
      tab.refused = true;
      throw new OpeningFailed(worktree, error);
    }
  }

  private async openWorktree(session: Session, root: string): Promise<void> {
    const tab = this.tabState(root);
    for (const message of replayOf(tab)) {
      session.post(message);
    }
    await tab.preloading;
    if (!this.isActiveIn(session, root)) {
      return;
    }
    this.stopWatching(session);
    const context = await this.context(session);
    if (
      !context ||
      session.disposed ||
      !this.isActiveIn(session, context.root)
    ) {
      return;
    }
    this.log.info(strings.log.tabOpen(context.root));
    this.addRecent(context.repository);
    await allSettled([this.watch(context, session), this.showTab(context)]);
  }

  private addRecent(repository: string): void {
    const last = this.storage.recent.slice(maxRecentItems - 1);
    this.save(
      this.storage.addRecent(repository).then(() => this.forgetUnused(last)),
    );
  }

  private async forgetUnused(roots: readonly string[]): Promise<void> {
    const { recent } = this.storage;
    for (const root of roots) {
      if (
        !recent.some((kept) => sameRoot(kept, root)) &&
        !this.hasRepository(root)
      ) {
        const worktrees = [...this.worktreeLists].find(([repository]) =>
          sameRoot(repository, root),
        )?.[1];
        await this.storage.forget(
          root,
          (worktrees ?? []).map((worktree) => worktree.root),
        );
      }
    }
  }

  private takeWorktrees(
    repository: string,
    worktrees: readonly Worktree[],
  ): Worktree[] {
    const [first, ...rest] = worktrees;
    const spelled = first ? [{ ...first, path: repository }, ...rest] : [];
    for (const worktree of spelled) {
      this.repositories.set(worktree.path, repository);
    }
    this.worktreeLists.set(repository, worktreeInfos(spelled));
    return spelled;
  }

  private async loadWorktrees(
    session: Session,
    repository: string,
  ): Promise<void> {
    const listing = (this.worktreeListings.get(repository) ?? 0) + 1;
    this.worktreeListings.set(repository, listing);
    const worktrees = await this.listedWorktrees(repository);
    if (
      worktrees === undefined ||
      this.worktreeListings.get(repository) !== listing
    ) {
      return;
    }
    const shown = JSON.stringify(this.worktreeLists.get(repository));
    this.forgetRemovedWorktrees(
      repository,
      this.takeWorktrees(repository, worktrees),
    );
    const shownIn = this.sessionShowingRepository(repository);
    if (
      JSON.stringify(this.worktreeLists.get(repository)) !== shown &&
      shownIn !== undefined
    ) {
      const page = this.live(shownIn);
      if (page) {
        this.sendTabs(page);
      }
    }
  }

  private forgetRemovedWorktrees(
    repository: string,
    listed: readonly Worktree[],
  ): void {
    for (const [root, tab] of this.tabStates) {
      if (
        sameRoot(this.repositoryOf(root), repository) &&
        !listed.some((worktree) => sameRoot(worktree.path, root)) &&
        !this.isActive(root)
      ) {
        this.forgetTab(root, tab);
      }
    }
    for (const [root, owner] of this.repositories) {
      if (
        sameRoot(owner, repository) &&
        !sameRoot(root, repository) &&
        !listed.some((worktree) => sameRoot(worktree.path, root)) &&
        !this.isActive(root)
      ) {
        this.repositories.delete(root);
      }
    }
  }

  private forgetTab(root: string, tab: TabWork): void {
    this.tabStates.delete(root);
    keptGits.stopIn(root);
    tab.closed.abort();
    tab.loadingFiles.abort();
    tab.loadingDiff.abort();
    this.navigation.commitSearches.get(root)?.abort();
  }

  private async listedWorktrees(
    repository: string,
  ): Promise<Worktree[] | undefined> {
    const known = [
      repository,
      this.storage.worktreeOf(repository),
      ...(this.worktreeLists.get(repository) ?? []).map(
        (worktree) => worktree.root,
      ),
    ];
    try {
      return await this.worktreesOf(repository, known);
    } catch (error) {
      this.log.error(strings.log.listingWorktreesFailed(repository));
      this.log.error(error);
      return undefined;
    }
  }

  private worktreesOf(
    repository: string,
    known: readonly string[],
  ): Promise<Worktree[]> {
    return listWorktrees(this.gitPath, repository, known);
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

  private async watch(context: Context, session: Session): Promise<void> {
    this.stopWatching(session);
    const watching = new AbortController();
    session.watching = watching;
    const started = performance.now();
    let watcher: Watcher;
    try {
      watcher = await this.startWatching(context, session, watching.signal);
    } catch (error) {
      if (!isWatchFailure(error)) {
        throw error;
      }
      this.couldNotWatch(context, error);
      return;
    }
    if (session.watching === watching) {
      session.watching = undefined;
    }
    if (
      watching.signal.aborted ||
      session.disposed ||
      session.watcher !== undefined ||
      !this.isActiveIn(session, context.root) ||
      this.tabStates.get(context.root) !== context.tab
    ) {
      void this.shell.track(watcher.dispose());
      return;
    }
    session.watcher = watcher;
    if (performance.now() - started > this.delays.delay) {
      void this.shell.track(this.loadWorktrees(session, context.repository));
      void this.run(
        strings.log.refreshingFailed,
        session,
        () => this.refreshes.refresh(context),
        context.root,
      );
    }
  }

  private couldNotWatch(context: Context, error: unknown): void {
    this.log.error(strings.log.watchingFailed(context.root));
    this.log.error(error);
    context.post({
      type: 'notice',
      level: 'error',
      message: strings.messages.couldNotWatch(context.root),
    });
  }

  private async showCompare(
    session: Session,
    tab: string,
    compared: Compared,
  ): Promise<void> {
    this.stopWatching(session);
    const shown = session.comparing;
    if (
      shown?.tab === tab &&
      shown.compared.old === compared.old &&
      shown.compared.new === compared.new
    ) {
      await this.sendCompare(session);
      return;
    }
    if (shown !== undefined) {
      this.forgetComparing(shown);
    }
    const comparing: Comparing = {
      tab,
      compared,
      running: undefined,
      version: 0,
      stop: watchFiles(
        [compared.old, compared.new],
        () => {
          if (session.comparing === comparing) {
            void this.sendCompare(session);
          }
        },
        (error) => {
          this.log.error(strings.log.watchingFailed(compared.new));
          this.log.error(error);
          session.post({
            type: 'notice',
            level: 'error',
            message: strings.messages.couldNotWatchCompared(
              compared.old,
              compared.new,
            ),
          });
        },
      ),
    };
    this.comparisons.set(tab, comparing);
    session.comparing = comparing;
    await this.sendCompare(session);
  }

  private async sendCompareTexts(
    session: Session,
    requests: readonly TextRequest[],
  ): Promise<void> {
    const { comparing } = session;
    if (comparing === undefined) {
      return;
    }
    const sides = new Map<TextRequest['side'], Promise<string | undefined>>();
    const sideText = (side: TextRequest['side']) => {
      const known = sides.get(side);
      if (known !== undefined) {
        return known;
      }
      const reading = comparedText(comparing.compared, side);
      sides.set(side, reading);
      return reading;
    };
    const texts = await Promise.all(
      uniqueTexts(requests).map(async (request) => ({
        path: request.path,
        side: request.side,
        blob: request.blob,
        text: await sideText(request.side),
      })),
    );
    if (session.comparing === comparing && texts.length > 0) {
      session.post({ type: 'compareTexts', tab: comparing.tab, texts });
    }
  }

  private stopComparing(session: Session): void {
    const { comparing } = session;
    if (comparing !== undefined) {
      this.forgetComparing(comparing);
      session.comparing = undefined;
      session.post({ type: 'compare', compare: undefined });
    }
  }

  private forgetComparing(comparing: Comparing): void {
    comparing.stop();
    comparing.running?.abort();
    if (this.comparisons.get(comparing.tab) === comparing) {
      this.comparisons.delete(comparing.tab);
    }
  }

  private async sendCompare(session: Session): Promise<void> {
    const { comparing } = session;
    if (comparing === undefined) {
      return;
    }
    const { compared } = comparing;
    const { showEntireFile: entire, ignoreWhitespace } = this.storage.layout;
    const version = ++comparing.version;
    comparing.running?.abort();
    const running = new AbortController();
    comparing.running = running;
    let patch = '';
    let same: 'identical' | 'whitespace' | undefined;
    let error: Sentence | undefined;
    try {
      patch = await comparedFilesPatch(
        this.gitPath,
        compared,
        { entireFile: entire, ignoreWhitespace },
        running.signal,
      );
      if (patch === '') {
        same = await filesAlike(compared);
      }
    } catch (failure) {
      if (running.signal.aborted) {
        return;
      }
      error =
        failure instanceof CompareTooLarge
          ? strings.messages.compareTooLarge(compareMaxBytes / 1024 / 1024)
          : strings.messages.couldNotCompare(
              compared.old,
              compared.new,
              gitErrorText(failure),
            );
    }
    if (session.comparing !== comparing || comparing.version !== version) {
      return;
    }
    session.post({
      type: 'compare',
      compare: {
        tab: comparing.tab,
        name: comparedNames(compared)[1],
        old: compared.old,
        new: compared.new,
        patch,
        entire,
        version,
        ...(same !== undefined && { same }),
        ...(error !== undefined && { error }),
      },
    });
  }

  private stopWatching(session: Session): void {
    session.watching?.abort();
    session.watching = undefined;
    const { watcher } = session;
    session.watcher = undefined;
    if (watcher) {
      void this.shell.track(watcher.dispose());
    }
  }

  private startWatching(
    context: Context,
    session: Session,
    signal: AbortSignal,
  ): Promise<Watcher> {
    return watchRepository(context.gitPath, context.root, {
      ...this.delays,
      signal,
      onChange: (change) =>
        void this.run(
          strings.log.refreshingFailed,
          session,
          () => this.refreshes.refresh(context, undefined, change),
          context.root,
        ),
      onWorktreesChange: () =>
        void this.shell.track(this.loadWorktrees(session, context.repository)),
      onError: (error) => {
        this.log.error(strings.log.watchingFailed(context.root));
        this.log.error(error);
      },
      onStopped: (error) => this.couldNotWatch(context, error),
    });
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

function needsNoWholeHistory(tab: TabState, message: TabMessage): boolean {
  switch (message.type) {
    case 'loadCommits':
    case 'viewFile':
    case 'fetch':
    case 'pull':
    case 'push':
    case 'pushTag':
    case 'pullBranch':
    case 'pushBranch':
    case 'prefetchDiff':
    case 'prefetchTexts':
      return true;
    case 'checkout':
      return (
        message.target.kind !== 'commit' ||
        tab.fullHistory.has(message.target.hash)
      );
    case 'selectCommit':
      return (
        message.hash === undefined ||
        hiddenSides(tab, message.hash).length === 0
      );
    case 'selectFile':
    case 'loadTree':
    case 'loadTexts':
    case 'loadFileDiff':
      return hiddenSides(tab, message.hash).length === 0;
    default:
      return false;
  }
}

function isPathAsked(value: unknown): value is string {
  return (
    typeof value === 'string' && !value.includes('\0') && !value.includes('\n')
  );
}

function isTextRequest(value: unknown): value is TextRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    isPathAsked(value.path) &&
    'blob' in value &&
    typeof value.blob === 'string' &&
    'side' in value &&
    (value.side === 'old' || value.side === 'new')
  );
}

function areTextRequests(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= maxTextsAsked &&
    value.every(isTextRequest)
  );
}

function isCheckoutTarget(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    return false;
  }
  return value.kind === 'commit'
    ? 'hash' in value && typeof value.hash === 'string'
    : (value.kind === 'branch' ||
        value.kind === 'remote' ||
        value.kind === 'tag') &&
        'name' in value &&
        typeof value.name === 'string';
}

function isWhole(value: number, least: number, most: number): boolean {
  return Number.isInteger(value) && value >= least && value <= most;
}

function isOptional<T>(
  value: T | undefined,
  is: (value: T) => boolean,
): boolean {
  return value === undefined || is(value);
}

const isString = (value: unknown) => typeof value === 'string';

const isBoolean = (value: unknown) => typeof value === 'boolean';

function wellFormed(message: GitToHost): boolean {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  switch (message.type) {
    case 'browseRepositories':
    case 'initRepository':
    case 'openClone':
    case 'closeClone':
    case 'stopClone':
      return true;
    case 'openRepository':
    case 'forgetRecent':
    case 'selectWorktree':
    case 'preloadWorktree':
      return isString(message.root);
    case 'initInside':
    case 'chooseCloneFolder':
      return isString(message.folder);
    case 'checkCloneTarget':
      return isString(message.folder) && isString(message.name);
    case 'clone':
      return [message.url, message.folder, message.name].every(isString);
    case 'setColumnWidths':
      return isColumnWidths(message.widths);
    case 'setCollapseMerges':
      return isBoolean(message.collapse);
    case 'setShowEntireFile':
    case 'setShowAllFiles':
      return isBoolean(message.show);
    case 'setIgnoreWhitespace':
      return isBoolean(message.ignore);
    case 'setAutoFetch':
      return isBoolean(message.on);
    case 'setDiffLayout':
      return diffLayouts.includes(message.layout);
    case 'loadCompareTexts':
      return areTextRequests(message.requests);
    default:
      return isString(message.root) && wellFormedInTab(message);
  }
}

function wellFormedInTab(message: TabMessage): boolean {
  switch (message.type) {
    case 'showUpstream':
    case 'showParent':
    case 'fetch':
    case 'pull':
    case 'push':
    case 'stopCommitSearch':
      return true;
    case 'setBookmarks':
      return (
        Array.isArray(message.bookmarks) &&
        message.bookmarks.length <= maxBookmarks &&
        message.bookmarks.every(
          (bookmark) =>
            isBookmark(bookmark) && bookmark.name.length <= maxBookmarkName,
        )
      );
    case 'setSolo':
      return isBoolean(message.solo);
    case 'loadTree':
    case 'jump':
    case 'toggleMerge':
      return isString(message.hash);
    case 'pushTag':
    case 'pullBranch':
    case 'pushBranch':
      return isString(message.name);
    case 'lookupHash':
    case 'searchCommits':
      return isString(message.query);
    case 'checkout':
      return isCheckoutTarget(message.target);
    case 'viewFile':
      return isPathAsked(message.path) && isOptional(message.blob, isString);
    case 'loadFileDiff':
      return (
        isString(message.hash) &&
        isPathAsked(message.path) &&
        Number.isFinite(message.diff)
      );
    case 'loadTexts':
      return (
        isString(message.hash) &&
        Number.isFinite(message.diff) &&
        areTextRequests(message.texts)
      );
    case 'prefetchDiff':
      return isString(message.hash);
    case 'prefetchTexts':
      return isString(message.hash) && areTextRequests(message.texts);
    case 'navigate':
      return (
        (message.direction === 'back' || message.direction === 'forward') &&
        isWhole(message.steps, 1, maxSteps)
      );
    case 'loadCommits':
      return (
        Number.isInteger(message.generation) &&
        isWhole(message.start, 0, Number.MAX_SAFE_INTEGER) &&
        isWhole(message.count, 1, maxCommitsAsked)
      );
    case 'scrolled':
      return (
        isString(message.hash) &&
        Number.isFinite(message.offset) &&
        Number.isFinite(message.report)
      );
    case 'selectCommit':
      return (
        isOptional(message.hash, isString) &&
        isOptional(message.replace, isBoolean) &&
        isOptional(message.selection, Number.isFinite)
      );
    case 'selectFile':
      return (
        isString(message.hash) &&
        isOptional(message.path, isPathAsked) &&
        isOptional(
          message.area,
          (area) => area === 'staged' || area === 'unstaged',
        )
      );
    default:
      return false;
  }
}

export function tabInfos(
  roots: readonly string[],
  paths: path.PlatformPath = path,
): RepositoryInfo[] {
  const same = (name: string) =>
    paths.sep === '\\' ? name.toLowerCase() : name;
  const tabs = roots.map((root) => ({
    root,
    name: tabName(root, paths),
    above: foldersAbove(namedFolder(root, paths), paths),
  }));
  return tabs.map(({ root, name, above }) => {
    const levels = new Set<number>();
    for (const other of tabs) {
      if (other.root === root || same(other.name) !== same(name)) {
        continue;
      }
      const level = above.findIndex(
        (folder, index) =>
          other.above[index] === undefined ||
          same(other.above[index]) !== same(folder),
      );
      if (level !== -1) {
        levels.add(level);
      }
    }
    if (levels.size === 0) {
      return { root, name };
    }
    const shown = [...levels].toSorted((a, b) => b - a);
    const folders = shown.flatMap((level, index) =>
      index > 0 && shown[index - 1] - level > 1
        ? [strings.symbols.foldersLeftOut, above[level]]
        : [above[level]],
    );
    return { root, name, folder: paths.join(...folders) };
  });
}

function namedFolder(root: string, paths: path.PlatformPath): string {
  const name = paths.basename(root);
  return name === '.bare' || name === '.git'
    ? namedFolder(paths.dirname(root), paths)
    : root;
}

function foldersAbove(folder: string, paths: path.PlatformPath): string[] {
  const parent = paths.dirname(folder);
  return parent === folder
    ? []
    : [paths.basename(parent) || parent, ...foldersAbove(parent, paths)];
}

export function tabName(root: string, paths: path.PlatformPath = path): string {
  const folder = namedFolder(root, paths);
  return paths.basename(folder).replace(/(.)\.git$/, '$1') || folder;
}

function worktreeInfos(worktrees: readonly Worktree[]): WorktreeInfo[] {
  const [first] = worktrees;
  const main = first !== undefined && !first.bare;
  return worktrees
    .filter((worktree) => !worktree.bare)
    .map((worktree, index) => ({
      root: worktree.path,
      name:
        worktree.branch ??
        (worktree.head === undefined
          ? tabName(worktree.path)
          : shortHash(worktree.head)),
      folder: path.basename(worktree.path),
      main: main && index === 0,
      missing: worktree.missing,
    }));
}
