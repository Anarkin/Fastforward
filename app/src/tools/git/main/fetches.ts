import { gitErrorText } from './errorText';
import { isFolder } from './folders';
import { fetchAllRemotes, remotesNotFetched } from './transfers';
import type { Log } from '../../../shell/main/log';
import { reportFailure, type Notify, type RepositoryAt } from './operations';
import { strings } from '../../../lib/shared/strings';
import {
  type Session,
  type Fetching,
  type Fetchable,
  type Context,
  refsAlone,
} from './tabContext';
import type { RemoteAccess } from './remoteWork';
import type { RemoteTags } from './remoteTags';

const silent = () => undefined;

export type Fetched =
  | { readonly failed: false; readonly changed: boolean }
  | { readonly failed: true; readonly error: unknown };

async function fetchAll(
  { gitPath, root }: RepositoryAt,
  interactive = true,
  stop?: AbortSignal,
): Promise<Fetched> {
  try {
    return {
      failed: false,
      changed: await fetchAllRemotes(gitPath, root, { interactive, stop }),
    };
  } catch (error) {
    return { failed: true, error };
  }
}

function reportFetched(log: Log, notify: Notify, fetched: Fetched): boolean {
  if (fetched.failed) {
    reportFailure(
      log,
      notify,
      strings.log.fetchFailed,
      strings.messages.couldNotFetch,
      fetched.error,
    );
    return false;
  }
  log.info(strings.log.fetched);
  return true;
}

export class Fetches {
  private readonly fetchFailures = new Set<string>();

  constructor(
    private readonly access: RemoteAccess,
    private readonly remoteTags: RemoteTags,
  ) {}

  async fetch(context: Context): Promise<void> {
    await this.refreshFetched(context, await this.fetchShown(context));
  }

  async fetchShown(context: Context): Promise<Fetched> {
    context.post({ type: 'fetching', running: true });
    try {
      return await this.fetchRemotes(
        context,
        this.access.log,
        this.access.core.notify(context),
      );
    } finally {
      context.post({ type: 'fetching', running: false });
    }
  }

  async refreshFetched(context: Context, fetched: Fetched): Promise<void> {
    if (fetched.failed || fetched.changed) {
      await this.access.refreshes.refresh(context, undefined, refsAlone);
    }
  }

  private async fetchRemotes(
    at: Fetchable,
    log: Log,
    notify: Notify,
    interactive = true,
  ): Promise<Fetched> {
    const { repository } = at;
    const { fetches } = this.access.remoteWork;
    const running = fetches.get(repository);
    const joined =
      running !== undefined && (!interactive || running.interactive);
    const fetching = joined ? running : this.startFetch(at, interactive);
    const result = await fetching.fetched;
    if (this.access.quitting.signal.aborted) {
      return result;
    }
    const latest = fetches.get(repository);
    if (!interactive && latest?.interactive) {
      return latest.fetched;
    }
    if (joined) {
      return result;
    }
    const fetched = reportFetched(log, notify, result);
    if (fetched) {
      this.fetchFailures.delete(repository);
    } else {
      this.fetchFailures.add(repository);
    }
    this.access.core.save(
      this.access.storage.fetches.recordFetch(repository, !fetched, Date.now()),
    );
    const shownIn = this.access.core.sessionShowingRepository(repository);
    const live = shownIn && this.access.core.live(shownIn);
    if (live !== undefined) {
      this.postLastFetch(live, repository);
    }
    const notFetched = result.failed
      ? remotesNotFetched(gitErrorText(result.error))
      : [];
    if (fetched || notFetched.length > 0) {
      void this.access
        .shell()
        .track(this.remoteTags.listTagsOfRemotes(at, interactive, notFetched));
    }
    return result;
  }

  postLastFetch(session: Session, repository: string | undefined): void {
    session.post({
      type: 'lastFetch',
      ...(repository !== undefined &&
        this.access.storage.fetches.lastFetchOf(repository)),
    });
  }

  private startFetch(at: Fetchable, interactive: boolean): Fetching {
    const { repository } = at;
    const { fetches } = this.access.remoteWork;
    const running = this.access.remoteWork.remoteWork(repository);
    const started: Fetching = {
      fetched: (running
        ? running.then(() =>
            fetchAll(at, interactive, this.access.quitting.signal),
          )
        : fetchAll(at, interactive, this.access.quitting.signal)
      ).finally(() => {
        if (fetches.get(repository) === started) {
          fetches.delete(repository);
        }
      }),
      interactive,
    };
    fetches.set(repository, started);
    return started;
  }

  async fetchInBackground(repository: string): Promise<void> {
    const session = this.access.core.page();
    const worktree = this.access.storage.worktreeOf(repository);
    const root = (await isFolder(worktree)) ? worktree : repository;
    if (
      !session ||
      !this.access.core.hasRepository(repository) ||
      !(await isFolder(root))
    ) {
      return;
    }
    const reported = !this.fetchFailures.has(repository);
    const log: Log = {
      info: silent,
      warn: reported ? (message) => this.access.log.warn(message) : silent,
      error: reported ? (error) => this.access.log.error(error) : silent,
    };
    const notify: Notify = reported
      ? this.access.core.noticesOf(session, repository)
      : silent;
    const fetched = await this.fetchRemotes(
      { gitPath: this.access.gitPath(), root, repository },
      log,
      notify,
      false,
    );
    if (fetched.failed || !fetched.changed) {
      return;
    }
    this.access.repositories.set(
      this.access.storage.worktreeOf(repository),
      repository,
    );
    await this.remoteTags.refreshRefsShown(repository);
  }
}
