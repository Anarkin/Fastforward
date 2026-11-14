import { isWatchFailure, watchRepository, type Watcher } from './cli/watch';
import type { Log } from '../../../shell/main/log';
import type { ShellAccess } from '../../../shell/main/shell';
import { strings } from '../../../shared/strings';
import type { TabWork, Session, Context, GitCore } from './tabContext';
import type { Refreshes } from './refreshes';

export interface WatchingHost {
  readonly loadWorktrees: (
    session: Session,
    repository: string,
  ) => Promise<void>;
}

export class Watching {
  constructor(
    private readonly log: Log,
    private readonly delays: {
      delay: number;
      maxDelay: number;
      gitDirDelay?: number;
    },
    private readonly shell: () => ShellAccess,
    private readonly refreshes: Refreshes,
    private readonly core: GitCore,
    private readonly tabStates: ReadonlyMap<string, TabWork>,
    private readonly host: WatchingHost,
  ) {}

  async watch(context: Context, session: Session): Promise<void> {
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
      !this.core.isActiveIn(session, context.root) ||
      this.tabStates.get(context.root) !== context.tab
    ) {
      void this.shell().track(watcher.dispose());
      return;
    }
    session.watcher = watcher;
    if (performance.now() - started > this.delays.delay) {
      void this.shell().track(
        this.host.loadWorktrees(session, context.repository),
      );
      void this.core.run(
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

  private startWatching(
    context: Context,
    session: Session,
    signal: AbortSignal,
  ): Promise<Watcher> {
    return watchRepository(context.gitPath, context.root, {
      ...this.delays,
      signal,
      onChange: (change) =>
        void this.core.run(
          strings.log.refreshingFailed,
          session,
          () => this.refreshes.refresh(context, undefined, change),
          context.root,
        ),
      onWorktreesChange: () =>
        void this.shell().track(
          this.host.loadWorktrees(session, context.repository),
        ),
      onError: (error) => {
        this.log.error(strings.log.watchingFailed(context.root));
        this.log.error(error);
      },
      onStopped: (error) => this.couldNotWatch(context, error),
    });
  }

  stopWatching(session: Session): void {
    session.watching?.abort();
    session.watching = undefined;
    const { watcher } = session;
    session.watcher = undefined;
    if (watcher) {
      void this.shell().track(watcher.dispose());
    }
  }
}
