import { strings } from '../../../lib/shared/strings';
import type { Page, ShellAccess, ShownTab } from '../../../shell/main/shell';
import { sameRoot } from '../../../shell/main/storage';
import type { Notify } from './operations';
import type { GitStorage } from './storage';
import type { Context, GitPost, Session, TabWork } from './tabContext';
import { tabInfos, tabName } from './tabNames';

export class GitSessions {
  private readonly sessions = new WeakMap<Page, Session>();
  cloningIn: Session | undefined;

  constructor(
    private readonly shell: () => ShellAccess,
    private readonly storage: GitStorage,
    private readonly tabStates: ReadonlyMap<string, TabWork>,
    private readonly repositories: ReadonlyMap<string, string>,
  ) {}

  of(page: Page): Session {
    const known = this.sessions.get(page);
    if (known !== undefined) {
      return known;
    }
    const session: Session = {
      page,
      post: (message) => {
        if (message.type === 'notice') {
          this.shell().notice(page, {
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

  get page(): Session | undefined {
    const page = this.shell().page();
    return page === undefined ? undefined : this.of(page);
  }

  get repositoryTabs(): string[] {
    return this.shell()
      .tabs()
      .flatMap((tab) =>
        tab.tool === 'git' && tab.root !== undefined ? [tab.root] : [],
      );
  }

  activeRepositoryIn(session: Session): string | undefined {
    const active = this.shell().active(session.page);
    return active?.tool === 'git' ? active.root : undefined;
  }

  activeWorktreeIn(session: Session): string | undefined {
    const repository = this.activeRepositoryIn(session);
    return repository === undefined
      ? undefined
      : this.storage.worktreeOf(repository);
  }

  shownRepositories(): string[] {
    return this.shell()
      .shown()
      .flatMap(({ tab }) =>
        tab.tool === 'git' && tab.root !== undefined ? [tab.root] : [],
      );
  }

  sessionShowingRepository(repository: string): Session | undefined {
    const shown = this.shell()
      .shown()
      .find(
        ({ tab }) =>
          tab.tool === 'git' &&
          tab.root !== undefined &&
          sameRoot(tab.root, repository),
      );
    return shown?.page === undefined ? undefined : this.of(shown.page);
  }

  sessionShowing(root: string): Session | undefined {
    const shown = this.showing(root);
    return shown?.page === undefined ? undefined : this.of(shown.page);
  }

  live(session: Session): Session | undefined {
    const page = this.shell().current(session.page);
    return page === undefined ? undefined : this.of(page);
  }

  cloneSession(): Session | undefined {
    const kept =
      this.cloningIn === undefined ? undefined : this.live(this.cloningIn);
    return kept ?? this.page;
  }

  hasRepository(root: string): boolean {
    return this.repositoryTabs.some((open) => sameRoot(open, root));
  }

  isActive(root: string): boolean {
    return this.showing(root) !== undefined;
  }

  isActiveIn(session: Session, root: string): boolean {
    const active = this.activeWorktreeIn(session);
    return active !== undefined && sameRoot(active, root);
  }

  showsActiveTab(session: Session): boolean {
    const active = this.activeWorktreeIn(session);
    return (
      !session.disposed &&
      active !== undefined &&
      this.tabStates.get(active)?.isRepository !== false &&
      this.tabStates.get(active)?.refused !== true
    );
  }

  repositoryOf(root: string): string {
    return this.repositories.get(root) ?? root;
  }

  knownRoot(root: string): string {
    return (
      [
        ...this.tabStates.keys(),
        ...this.repositories.keys(),
        ...this.repositoryTabs,
      ].find((known) => sameRoot(known, root)) ?? root
    );
  }

  notify(context: Context): Notify {
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

  noticesOf(session: Session, repository: string): Notify {
    return (level, message) =>
      this.hasRepository(repository) &&
      this.postToPage(session, {
        type: 'notice',
        level,
        message: strings.messages.inTab(this.tabLabel(repository), message),
      });
  }

  postToPage(session: Session, message: GitPost): void {
    if (message.type === 'notice') {
      this.shell().notice(session.page, {
        level: message.level,
        message: message.message,
      });
      return;
    }
    this.live(session)?.post(message);
  }

  private showing(root: string): ShownTab | undefined {
    return this.shell()
      .shown()
      .find(
        ({ tab }) =>
          tab.tool === 'git' &&
          tab.root !== undefined &&
          sameRoot(this.storage.worktreeOf(tab.root), root),
      );
  }

  private tabLabel(repository: string): string {
    const tab = tabInfos(this.repositoryTabs).find((info) =>
      sameRoot(info.root, repository),
    );
    return strings.tabs.label(tab?.name ?? tabName(repository), tab?.folder);
  }
}
