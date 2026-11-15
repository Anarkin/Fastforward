import type { AutoFetch } from './autoFetch';
import { keptGits } from './run';
import { locateRepository } from './repositoryLocation';
import type { Clones } from './clones';
import type { Log } from '../../../shell/main/log';
import type { GitToHost } from '../shared/protocol';
import {
  unattachedShell,
  type Page,
  type ShellAccess,
  type Tab,
  type TabName,
  type Tool,
} from '../../../shell/main/toolContract';
import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import { sameRoot } from '../../../lib/main/paths';
import type { Timer } from '../../../lib/main/timer';
import type { GitStorage } from './storage';
import type { TabWork } from './tabContext';
import { allSettled } from './allSettled';
import type { Diffs } from './diffs';
import type { TreePaths } from './treePaths';
import type { HistoryPages } from './historyPages';
import type { Refreshes } from './refreshes';
import type { CommitNavigation } from './commitNavigation';
import type { CommitSearch } from './commitSearch';
import type { Fetches } from './fetches';
import type { RemoteTags } from './remoteTags';
import type { RemoteWork } from './remoteWork';
import type { Remotes } from './remotes';
import type { Watching } from './watching';
import type { CompareTabs } from './compareTabs';
import { wellFormed } from './messageChecks';
import type { Worktrees } from './worktrees';
import type { RepositoryOpening } from './repositoryOpening';
import { namesOfTabs } from './tabNames';
import type { GitSessions } from './sessions';
import type { Contexts } from './contexts';
import type { TabPosts } from './tabPosts';
import type { DiffImages } from './diffImages';
import type { Inits } from './inits';
import type { ViewSettings } from './viewSettings';
import type { TabLoads } from './tabLoads';
import type { Runs } from './runs';
import type { GitMessages } from './gitMessages';
import { buildParts } from './gitParts';
import { needsGit, type GitLocator } from './gitLocator';
import { inFolderWithGit } from './repository';

export const refreshDelays = { delay: 100, gitDirDelay: 300, maxDelay: 1500 };
export type FolderPurpose = 'init' | 'clone';

const runsNoGit: ReadonlySet<GitToHost['type']> = new Set([
  'forgetRecent',
  'setColumnWidths',
  'setShowAllFiles',
  'setDiffLayout',
  'setAutoFetch',
  'scrolled',
  'stopCommitSearch',
]);

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
  private readonly tabStates: Map<string, TabWork>;
  private readonly autoFetch: AutoFetch;
  private readonly quitting: AbortController;
  private readonly clones: Clones;
  private readonly sessions: GitSessions;
  private readonly contexts: Contexts;
  private readonly posts: TabPosts;
  private readonly diffImages: DiffImages;
  private readonly inits: Inits;
  private readonly viewSettings: ViewSettings;
  private readonly diffs: Diffs;
  private readonly treePaths: TreePaths;
  private readonly historyPages: HistoryPages;
  private readonly refreshes: Refreshes;
  private readonly commitNavigation: CommitNavigation;
  private readonly commitSearch: CommitSearch;
  private readonly remoteWork: RemoteWork;
  private readonly remoteTags: RemoteTags;
  private readonly fetches: Fetches;
  private readonly remotes: Remotes;
  private readonly watching: Watching;
  private readonly compareTabs: CompareTabs;
  private readonly worktrees: Worktrees;
  private readonly repositoryOpening: RepositoryOpening;
  private readonly tabLoads: TabLoads;
  private readonly runs: Runs;
  private readonly messages: GitMessages;

  constructor(
    private readonly log: Log,
    private readonly locator: GitLocator,
    private readonly storage: GitStorage,
    private readonly host: GitHost,
    timer?: Timer,
    delays: {
      delay: number;
      maxDelay: number;
      gitDirDelay?: number;
    } = refreshDelays,
  ) {
    const parts = buildParts(
      log,
      locator,
      storage,
      host,
      () => this.shell,
      (saving) => this.save(saving),
      timer,
      delays,
    );
    this.tabStates = parts.tabStates;
    this.autoFetch = parts.autoFetch;
    this.quitting = parts.quitting;
    this.clones = parts.clones;
    this.sessions = parts.sessions;
    this.contexts = parts.contexts;
    this.posts = parts.posts;
    this.diffImages = parts.diffImages;
    this.inits = parts.inits;
    this.viewSettings = parts.viewSettings;
    this.diffs = parts.diffs;
    this.treePaths = parts.treePaths;
    this.historyPages = parts.historyPages;
    this.refreshes = parts.refreshes;
    this.commitNavigation = parts.commitNavigation;
    this.commitSearch = parts.commitSearch;
    this.remoteWork = parts.remoteWork;
    this.remoteTags = parts.remoteTags;
    this.fetches = parts.fetches;
    this.remotes = parts.remotes;
    this.watching = parts.watching;
    this.compareTabs = parts.compareTabs;
    this.worktrees = parts.worktrees;
    this.repositoryOpening = parts.repositoryOpening;
    this.tabLoads = parts.tabLoads;
    this.runs = parts.runs;
    this.messages = parts.messages;
  }

  quit(): void {
    this.quitting.abort();
    this.save(this.storage.fetches.saveFetches());
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
    session.post(this.storage.preferences.layout);
    this.posts.sendRecent(session);
  }

  async show(page: Page, tab: Tab): Promise<void> {
    const session = this.sessions.of(page);
    if (tab.compare !== undefined) {
      if (this.locator.path === undefined) {
        await this.missingGit(page);
      }
      await this.compareTabs.showCompare(session, tab.id, tab.compare);
      return;
    }
    this.compareTabs.stopComparing(session);
    const { root } = tab;
    if (root === undefined) {
      return;
    }
    const missing =
      this.locator.path === undefined ? await this.missingGit(page) : undefined;
    if (missing !== undefined) {
      this.contexts.tabState(this.storage.worktreeOf(root)).refused = true;
      this.posts.postTabs(session);
      session.post({ type: 'error', message: missing });
      return;
    }
    await this.runs.run(
      strings.log.showingTabFailed(root),
      session,
      () => this.repositoryOpening.openTab(session, root),
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
    if (root === undefined || this.locator.path === undefined) {
      return;
    }
    const session = this.sessions.of(page);
    await this.runs.run(strings.log.preloadingFailed(root), session, () =>
      allSettled([
        this.worktrees.loadWorktrees(session, root),
        this.tabLoads.preloadRoot(session, this.storage.worktreeOf(root), root),
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
    this.save(this.repositoryOpening.forgetUnused([closed]));
    this.posts.sendRecentEverywhere();
  }

  receive(page: Page, message: GitToHost): Promise<void> {
    if (!wellFormed(message)) {
      return Promise.resolve();
    }
    const session = this.sessions.of(page);
    return this.runs.run(
      strings.log.handlingFailed(message.type),
      session,
      async () => {
        if (
          runsNoGit.has(message.type) ||
          this.locator.path !== undefined ||
          (await this.missingGit(page)) === undefined
        ) {
          await this.messages.handle(message, session);
        }
      },
      this.messages.worktreeAsked(message),
    );
  }

  refreshShown(page: Page): Promise<void> {
    if (this.locator.path === undefined) {
      return Promise.resolve();
    }
    const session = this.sessions.of(page);
    return this.runs.run(
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
    const git = await this.locator.located();
    if (git.kind !== 'found') {
      if (await inFolderWithGit(folder)) {
        this.shell.notice(undefined, {
          level: 'error',
          message: needsGit(git),
        });
      }
      return false;
    }
    try {
      return (await locateRepository(git.path, folder)) !== undefined;
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
    return this.runs.run(strings.log.openingAskedFailed, session, async () => {
      if (
        this.locator.path !== undefined ||
        (await this.missingGit(page)) === undefined
      ) {
        await this.repositoryOpening.openRepositories(session, folders);
      }
    });
  }

  newTab(page: Page): Promise<void> {
    const session = this.sessions.of(page);
    return this.runs.run(strings.log.openingAskedFailed, session, async () => {
      if (
        this.locator.path !== undefined ||
        (await this.missingGit(page)) === undefined
      ) {
        await this.repositoryOpening.openRepositories(
          session,
          await this.host.chooseFolders(),
        );
      }
    });
  }

  idle(): Promise<void> {
    return this.shell.idle();
  }

  image(url: URL): Promise<Response> {
    return this.diffImages.image(url);
  }

  async initRepositoryIn(folder: string): Promise<void> {
    const session = this.sessions.page;
    if (
      session !== undefined &&
      (this.locator.path !== undefined ||
        (await this.missingGit(session.page)) === undefined)
    ) {
      await this.inits.initIn(session, folder);
    }
  }

  async cloneInto(folder: string): Promise<void> {
    const session = this.sessions.page;
    if (
      this.locator.path !== undefined ||
      (await this.missingGit(session?.page)) === undefined
    ) {
      this.sessions.cloningIn = session;
      await this.clones.openIn(folder);
    }
  }

  private async missingGit(
    page: Page | undefined,
  ): Promise<Sentence | undefined> {
    const git = await this.locator.located();
    if (git.kind === 'found') {
      return undefined;
    }
    const message = needsGit(git);
    this.shell.notice(page, { level: 'error', message });
    return message;
  }

  private save(saving: Promise<void>): void {
    void saving.catch((error: unknown) => {
      this.log.error(strings.log.savingFailed);
      this.log.error(error);
    });
  }
}
