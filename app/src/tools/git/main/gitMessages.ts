import type { TabMessage, GitToHost } from '../shared/protocol';
import { sameRoot } from '../../../lib/main/paths';
import type { GitStorage } from './storage';
import { toggleMerges } from './tabLayout';
import type { TabWork, Session } from './tabContext';
import { needsNoWholeHistory } from './historyWait';
import type { GitHost } from './tool';
import type { GitSessions } from './sessions';
import type { Contexts } from './contexts';
import type { TabPosts } from './tabPosts';
import type { RepositoryOpening } from './repositoryOpening';
import type { Inits } from './inits';
import type { Clones } from './clones';
import type { TabLoads } from './tabLoads';
import type { ViewSettings } from './viewSettings';
import type { CompareTabs } from './compareTabs';
import type { RepositoryChoices } from './repositoryChoices';
import type { CommitSearch } from './commitSearch';
import type { HistoryPages } from './historyPages';
import type { Remotes } from './remotes';
import type { CommitNavigation } from './commitNavigation';
import type { Selections } from './selections';
import type { FileViews } from './fileViews';
import type { KeptGitTabs } from './keptGitTabs';

export class GitMessages {
  constructor(
    private readonly storage: GitStorage,
    private readonly host: GitHost,
    private readonly tabStates: ReadonlyMap<string, TabWork>,
    private readonly sessions: GitSessions,
    private readonly contexts: Contexts,
    private readonly posts: TabPosts,
    private readonly repositoryOpening: RepositoryOpening,
    private readonly inits: Inits,
    private readonly clones: Clones,
    private readonly tabLoads: TabLoads,
    private readonly viewSettings: ViewSettings,
    private readonly compareTabs: CompareTabs,
    private readonly choices: RepositoryChoices,
    private readonly commitSearch: CommitSearch,
    private readonly historyPages: HistoryPages,
    private readonly remotes: Remotes,
    private readonly commitNavigation: CommitNavigation,
    private readonly selections: Selections,
    private readonly fileViews: FileViews,
    private readonly kept: KeptGitTabs,
    private readonly save: (saving: Promise<void>) => void,
  ) {}

  worktreeAsked(message: GitToHost): string | undefined {
    switch (message.type) {
      case 'openRepository':
        return this.storage.worktreeOf(message.root);
      default:
        return 'root' in message ? message.root : undefined;
    }
  }

  async handle(message: GitToHost, session: Session): Promise<void> {
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
        await this.repositoryOpening.openTab(session, repository);
        return;
      }
      case 'openRepository': {
        const recent = storage.recent.find((root) =>
          sameRoot(root, message.root),
        );
        if (recent !== undefined) {
          await this.repositoryOpening.openRepositories(
            session,
            [recent],
            true,
          );
        }
        return;
      }
      case 'browseRepositories':
        await this.repositoryOpening.openRepositories(
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
        await this.repositoryOpening.forgetUnused([message.root]);
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
          await this.tabLoads.preloadRoot(session, root, repository);
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
        await this.commitSearch.searchCommits(
          session,
          sessions.knownRoot(message.root),
          message.query,
          message.options,
        );
        return;
      case 'stopCommitSearch':
        this.commitSearch.commitSearches
          .get(sessions.knownRoot(message.root))
          ?.abort();
        return;
      case 'keepTab': {
        const root = sessions.knownRoot(message.root);
        if (this.tabStates.has(root)) {
          this.kept.keepWorktree(
            session.page,
            sessions.repositoryOf(root),
            root,
            message.kept,
          );
        }
        return;
      }
      case 'keepCompare':
        this.kept.keepCompare(session.page, message.tab, message.kept);
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
        await this.historyPages.sendCommitPage(
          context,
          message.generation,
          message.start,
          message.count,
        );
        break;
      case 'toggleMerge':
        if (context.tab.fullHistory.isMerge(message.hash)) {
          toggleMerges(context.tab, [message.hash]);
          await this.historyPages.sendShownHistory(context, {
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
        await this.commitNavigation.receive(context, message, picked);
        break;
      case 'lookupHash':
        await this.commitSearch.lookupHash(context, message.query);
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
}
