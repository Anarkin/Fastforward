import type { Log } from '../../../shell/main/log';
import type { ShellAccess } from '../../../shell/main/toolContract';
import type { CommitNavigation } from './commitNavigation';
import type { Refreshes } from './refreshes';
import type { GitStorage } from './storage';
import type { Context, Fetching, GitCore, RunningOn } from './tabContext';

export interface RemoteAccess {
  readonly log: Log;
  readonly gitPath: string;
  readonly storage: GitStorage;
  readonly shell: () => ShellAccess;
  readonly refreshes: Refreshes;
  readonly commitNavigation: CommitNavigation;
  readonly core: GitCore;
  readonly quitting: AbortController;
  readonly repositories: Map<string, string>;
  readonly remoteWork: RemoteWork;
}

export class RemoteWork {
  readonly fetches = new Map<string, Fetching>();
  private readonly pushes = new Map<string, Promise<unknown>>();

  async runningOn<T>(
    context: Context,
    type: RunningOn,
    name: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const names = context.tab.runningOn[type];
    names.add(name);
    context.post({ type, names: [...names] });
    try {
      return await work();
    } finally {
      names.delete(name);
      context.post({ type, names: [...names] });
    }
  }

  async afterRemoteWork<T>(
    repository: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const { pushes } = this;
    const pushing = (this.remoteWork(repository) ?? Promise.resolve()).then(
      work,
    );
    pushes.set(repository, pushing);
    try {
      return await pushing;
    } finally {
      if (pushes.get(repository) === pushing) {
        pushes.delete(repository);
      }
    }
  }

  remoteWork(repository: string): Promise<unknown> | undefined {
    const running = [
      this.fetches.get(repository)?.fetched,
      this.pushes.get(repository),
    ].filter((work) => work !== undefined);
    return running.length === 0 ? undefined : Promise.allSettled(running);
  }
}
