import { strings } from '../../../lib/shared/strings';
import { remoteTagRefs } from './refs';
import { readRefs, repositoryRoot } from './repository';
import type { GitSessions } from './sessions';
import type { GitStorage } from './storage';
import {
  nothing,
  type Context,
  type ReadRefs,
  type Session,
  type TabWork,
} from './tabContext';
import { keep, newTabState } from './tabState';
import { UntrackedPatches } from './workingTree';

const maxKeptUntrackedChars = 32_000_000;

export class Contexts {
  constructor(
    private readonly gitPath: string,
    private readonly storage: GitStorage,
    private readonly tabStates: Map<string, TabWork>,
    private readonly sessions: GitSessions,
  ) {}

  tabState(root: string): TabWork {
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

  async refsOf(context: Context): Promise<ReadRefs> {
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

  async context(
    session: Session,
    root = this.sessions.activeWorktreeIn(session),
    live = true,
  ): Promise<Context | undefined> {
    if (!root) {
      return undefined;
    }
    const tab = this.tabState(root);
    tab.isRepository ||=
      (await repositoryRoot(this.gitPath, root)) !== undefined;
    if (!tab.isRepository) {
      if (live && this.sessions.isActiveIn(session, root)) {
        tab.refreshError = strings.messages.notRepository(root);
        session.post({ type: 'error', message: tab.refreshError });
      }
      return undefined;
    }
    return {
      gitPath: this.gitPath,
      root,
      repository: this.sessions.repositoryOf(root),
      tab,
      session: live ? session : undefined,
      post: (message) => {
        if (message.type !== 'notice') {
          keep(tab.shown, message);
        }
        if (this.tabStates.get(root) !== tab) {
          return;
        }
        const shownIn = this.sessions.isActiveIn(session, root)
          ? session
          : this.sessions.sessionShowing(root);
        if (shownIn !== undefined) {
          this.sessions.postToPage(shownIn, message);
        }
      },
    };
  }
}
