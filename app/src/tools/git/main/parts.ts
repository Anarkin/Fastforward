import { AutoFetch, fetchOrder } from './autoFetch';
import { Clones } from './clones';
import type { Log } from '../../../shell/main/log';
import type { WorktreeInfo } from '../shared/protocol';
import type { ShellAccess } from '../../../shell/main/toolContract';
import { strings } from '../../../lib/shared/strings';
import type { Timer } from '../../../lib/main/timer';
import type { GitStorage } from './storage';
import type { TabWork, GitCore } from './tabContext';
import { Diffs } from './diffs';
import { DiffTexts } from './diffTexts';
import { TreePaths } from './treePaths';
import { HistoryPages } from './historyPages';
import { Refreshes } from './refreshes';
import { CommitNavigation } from './commitNavigation';
import { CommitSearch } from './commitSearch';
import { Fetches } from './fetches';
import { RemoteTags } from './remoteTags';
import { RemoteWork } from './remoteWork';
import { Remotes } from './remotes';
import { Watching } from './watching';
import { Worktrees } from './worktrees';
import { RepositoryOpening } from './repositoryOpening';
import { GitSessions } from './sessions';
import { Selections } from './selections';
import { RepositoryChoices } from './repositoryChoices';
import { Contexts } from './contexts';
import { TabPosts } from './tabPosts';
import { FileViews } from './fileViews';
import { DiffImages } from './diffImages';
import { Inits } from './inits';
import { ViewSettings } from './viewSettings';
import { TabLoads } from './tabLoads';
import { Runs } from './runs';
import { GitMessages } from './messages';
import type { GitHost } from './tool';
import type { GitLocator } from './gitLocator';

export interface GitParts {
  readonly tabStates: Map<string, TabWork>;
  readonly autoFetch: AutoFetch;
  readonly quitting: AbortController;
  readonly clones: Clones;
  readonly sessions: GitSessions;
  readonly contexts: Contexts;
  readonly posts: TabPosts;
  readonly diffImages: DiffImages;
  readonly inits: Inits;
  readonly viewSettings: ViewSettings;
  readonly diffs: Diffs;
  readonly treePaths: TreePaths;
  readonly historyPages: HistoryPages;
  readonly refreshes: Refreshes;
  readonly commitNavigation: CommitNavigation;
  readonly commitSearch: CommitSearch;
  readonly remoteWork: RemoteWork;
  readonly remoteTags: RemoteTags;
  readonly fetches: Fetches;
  readonly remotes: Remotes;
  readonly watching: Watching;
  readonly worktrees: Worktrees;
  readonly repositoryOpening: RepositoryOpening;
  readonly tabLoads: TabLoads;
  readonly runs: Runs;
  readonly messages: GitMessages;
}

export function buildParts(
  log: Log,
  locator: GitLocator,
  storage: GitStorage,
  host: GitHost,
  shell: () => ShellAccess,
  save: (saving: Promise<void>) => void,
  timer: Timer | undefined,
  delays: {
    delay: number;
    maxDelay: number;
    gitDirDelay?: number;
  },
): GitParts {
  const gitPath = () => locator.pathToRun();
  const tabStates = new Map<string, TabWork>();
  const repositories = new Map<string, string>();
  const worktreeLists = new Map<string, readonly WorktreeInfo[]>();
  const quitting = new AbortController();
  const treePaths = new TreePaths();
  const remoteWork = new RemoteWork();
  const sessions = new GitSessions(shell, storage, tabStates, repositories);
  const runs = new Runs(log, shell, sessions, tabStates);
  const contexts = new Contexts(gitPath, storage, tabStates, sessions);
  const posts = new TabPosts(
    storage,
    shell,
    sessions,
    contexts,
    () => fetches,
    worktreeLists,
    save,
  );
  const core: GitCore = {
    context: (session, root, live) => contexts.context(session, root, live),
    run: (failed, session, action, root) =>
      runs.run(failed, session, action, root),
    live: (session) => sessions.live(session),
    page: () => sessions.page,
    sessionShowing: (root) => sessions.sessionShowing(root),
    sessionShowingRepository: (repository) =>
      sessions.sessionShowingRepository(repository),
    isActiveIn: (session, root) => sessions.isActiveIn(session, root),
    hasRepository: (root) => sessions.hasRepository(root),
    notify: (context) => sessions.notify(context),
    noticesOf: (session, repository) => sessions.noticesOf(session, repository),
    refsOf: (context) => contexts.refsOf(context),
    sendRepository: (context, refs) => posts.sendRepository(context, refs),
    rememberSelection: (context) => selections.remember(context),
    save,
  };
  const diffs = new Diffs(storage, shell, treePaths);
  const selections = new Selections(
    storage,
    diffs,
    new DiffTexts(treePaths),
    treePaths,
    () => commitNavigation,
    save,
  );
  const historyPages = new HistoryPages(log, storage, shell, {
    rememberSelection: (context) => selections.remember(context),
    bookmarkedOf: (repository) => choices.bookmarkedOf(repository),
    sendNavigation: (context, current) =>
      commitNavigation.sendNavigation(context, current),
  });
  const refreshes = new Refreshes(
    log,
    storage,
    diffs,
    treePaths,
    historyPages,
    core,
  );
  const tabLoads = new TabLoads(
    log,
    contexts,
    posts,
    refreshes,
    diffs,
    historyPages,
    repositories,
  );
  const choices = new RepositoryChoices(
    storage,
    tabStates,
    sessions,
    contexts,
    refreshes,
    historyPages,
    save,
  );
  const commitNavigation = new CommitNavigation(
    log,
    storage,
    shell,
    diffs,
    historyPages,
    core,
  );
  const commitSearch = new CommitSearch(storage, core);
  const remote = {
    log,
    gitPath,
    storage,
    shell,
    refreshes,
    commitNavigation,
    core,
    quitting,
    repositories,
    remoteWork,
  };
  const remoteTags = new RemoteTags(remote);
  const fetches = new Fetches(remote, remoteTags);
  const remotes = new Remotes(remote, fetches, remoteTags);
  const watching = new Watching(
    log,
    delays,
    shell,
    refreshes,
    core,
    tabStates,
    {
      loadWorktrees: (session, repository) =>
        worktrees.loadWorktrees(session, repository),
    },
  );
  const worktrees = new Worktrees(
    log,
    gitPath,
    storage,
    core,
    commitSearch,
    tabStates,
    repositories,
    worktreeLists,
    {
      repositoryOf: (root) => sessions.repositoryOf(root),
      isActive: (root) => sessions.isActive(root),
      sendTabs: (session) => posts.sendTabs(session),
    },
  );
  const repositoryOpening = new RepositoryOpening(
    log,
    gitPath,
    storage,
    shell,
    core,
    watching,
    repositories,
    worktreeLists,
    {
      repositoryTabs: () => sessions.repositoryTabs,
      tabState: (root) => contexts.tabState(root),
      showTab: (context) => tabLoads.showTab(context),
      postTabs: (session) => posts.postTabs(session),
      sendRecentEverywhere: () => posts.sendRecentEverywhere(),
      takeWorktrees: (repository, listed) =>
        worktrees.takeWorktrees(repository, listed),
      loadWorktrees: (session, repository) =>
        worktrees.loadWorktrees(session, repository),
    },
  );
  const fileViews = new FileViews(gitPath, host.viewedFiles, shell, sessions);
  const diffImages = new DiffImages(log, gitPath, shell, tabStates);
  const inits = new Inits(log, gitPath, repositoryOpening);
  const autoFetch = new AutoFetch(
    () => storage.preferences.autoFetchMinutes,
    () => fetchOrder(sessions.repositoryTabs, sessions.shownRepositories()),
    (root) =>
      locator.path === undefined
        ? Promise.resolve()
        : shell().track(fetches.fetchInBackground(root)),
    timer,
  );
  autoFetch.update();
  const viewSettings = new ViewSettings(
    storage,
    tabStates,
    () => autoFetch,
    diffs,
    historyPages,
    contexts,
    save,
  );
  const clones = new Clones(
    log,
    gitPath,
    {
      post: (message) => sessions.cloneSession()?.post(message),
      open: async (target) => {
        const session = sessions.cloneSession();
        if (session !== undefined) {
          await runs.runNow(strings.log.openingFailed(target), session, () =>
            repositoryOpening.openRepositories(session, [target]),
          );
        }
      },
      track: (work) => void shell().track(work),
      chooseFolder: (from) => host.chooseFolder('clone', from),
      clipboardText: () => host.clipboardText(),
      savedFolder: () => storage.cloneFolder,
      saveFolder: (folder) => save(storage.setCloneFolder(folder)),
    },
    quitting.signal,
  );
  const messages = new GitMessages(
    storage,
    host,
    tabStates,
    sessions,
    contexts,
    posts,
    repositoryOpening,
    inits,
    clones,
    tabLoads,
    viewSettings,
    choices,
    commitSearch,
    historyPages,
    remotes,
    commitNavigation,
    selections,
    fileViews,
    save,
  );
  return {
    tabStates,
    autoFetch,
    quitting,
    clones,
    sessions,
    contexts,
    posts,
    diffImages,
    inits,
    viewSettings,
    diffs,
    treePaths,
    historyPages,
    refreshes,
    commitNavigation,
    commitSearch,
    remoteWork,
    remoteTags,
    fetches,
    remotes,
    watching,
    worktrees,
    repositoryOpening,
    tabLoads,
    runs,
    messages,
  };
}
