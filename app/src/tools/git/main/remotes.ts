import { readUpstream } from './cli/branches';
import { gitErrorText } from './cli/errorText';
import {
  fetchRemote,
  isFolder,
  listRemoteTags,
  listRemotes,
  readHead,
  readRefs,
  remotesNotFetched,
  type Head,
} from './cli/repository';
import type { Changed } from './cli/watch';
import { listWorktrees } from './cli/worktrees';
import type { Log } from '../../../shell/main/log';
import {
  canPull,
  checkout,
  fastForwardToUpstream,
  fetchAll,
  foundUpstream,
  pickTagRemote,
  pushTag,
  pushToUpstream,
  reportFetched,
  type Fetched,
  type Pushed,
  type Notify,
} from './operations';
import { sameTags } from './refs';
import { isFullHash } from '../shared/hashes';
import { hasRef } from '../shared/refNames';
import type { CheckoutTarget } from '../shared/protocol';
import type { ShellAccess } from '../../../shell/main/shell';
import { strings } from '../../../lib/shared/strings';
import { sameRoot } from '../../../shell/main/storage';
import type { GitStorage } from './storage';
import {
  type RunningOn,
  type Session,
  type Fetching,
  type Fetchable,
  type Context,
  notInHistory,
  type GitCore,
} from './tabContext';
import type { Refreshes } from './refreshes';
import type { Navigation } from './navigation';

const refsAlone: Changed = { refs: true, workingTree: false };

const silent = () => undefined;

export class Remotes {
  private readonly fetches = new Map<string, Fetching>();
  private readonly pushes = new Map<string, Promise<unknown>>();
  private readonly fetchFailures = new Set<string>();
  private tagsRecorded = 0;

  constructor(
    private readonly log: Log,
    private readonly gitPath: string,
    private readonly storage: GitStorage,
    private readonly shell: () => ShellAccess,
    private readonly refreshes: Refreshes,
    private readonly navigation: Navigation,
    private readonly core: GitCore,
    private readonly quitting: AbortController,
    private readonly repositories: Map<string, string>,
  ) {}

  checkout(
    context: Context,
    target: CheckoutTarget,
    picked: number | undefined,
  ): Promise<void> {
    return this.queueHeadMove(context, () =>
      this.checkoutNow(context, target, picked),
    );
  }

  private async checkoutNow(
    context: Context,
    target: CheckoutTarget,
    picked: number | undefined,
  ): Promise<void> {
    if (
      !(await this.checkable(context, target)) ||
      !(await checkout(this.log, this.core.notify(context), context, target))
    ) {
      return;
    }
    await this.refreshes.refresh(context);
    await context.tab.loadingHistory;
    await this.navigation.showHead(context, picked);
  }

  private async checkable(
    context: Context,
    target: CheckoutTarget,
  ): Promise<boolean> {
    if (target.kind === 'commit') {
      if (isFullHash(target.hash) && context.tab.fullHistory.has(target.hash)) {
        return true;
      }
      notInHistory(context, target.hash);
      return false;
    }
    const { refs } = await readRefs(context.gitPath, context.root);
    if (hasRef(refs, target)) {
      return true;
    }
    this.core.notify(context)(
      'error',
      strings.messages.noRefToCheckOut(target.name),
    );
    return false;
  }

  async fetch(context: Context): Promise<void> {
    await this.refreshFetched(context, await this.fetchShown(context));
  }

  private async fetchShown(context: Context): Promise<Fetched> {
    context.post({ type: 'fetching', running: true });
    try {
      return await this.fetchRemotes(
        context,
        this.log,
        this.core.notify(context),
      );
    } finally {
      context.post({ type: 'fetching', running: false });
    }
  }

  private async refreshFetched(
    context: Context,
    fetched: Fetched,
  ): Promise<void> {
    if (fetched.failed || fetched.changed) {
      await this.refreshes.refresh(context, undefined, refsAlone);
    }
  }

  pull(context: Context, picked: number | undefined): Promise<void> {
    return this.queueHeadMove(context, () => this.pullNow(context, picked));
  }

  private async pullNow(
    context: Context,
    picked: number | undefined,
  ): Promise<void> {
    const notify = this.core.notify(context);
    context.post({ type: 'pulling', running: true });
    let fetched: Fetched | undefined;
    let pulled = false;
    try {
      if (await canPull(this.log, notify, context)) {
        fetched = await this.fetchShown(context);
        pulled =
          (await this.fetchedForPull(context, fetched)) &&
          (await fastForwardToUpstream(this.log, notify, context));
      }
    } finally {
      context.post({ type: 'pulling', running: false });
    }
    if (pulled) {
      await this.refreshes.refresh(context);
      await context.tab.loadingHistory;
      await this.navigation.showHead(context, picked);
    } else if (fetched) {
      await this.refreshFetched(context, fetched);
    }
  }

  private async fetchedForPull(
    context: Context,
    fetched: Fetched,
    branch?: string,
  ): Promise<boolean> {
    if (!fetched.failed) {
      return true;
    }
    const upstream = await readUpstream(
      context.gitPath,
      context.root,
      branch,
    ).catch(() => undefined);
    if (upstream?.kind !== 'found') {
      return false;
    }
    return (
      upstream.remote === '.' ||
      this.afterRemoteWork(context.repository, () =>
        fetchRemote(context.gitPath, context.root, upstream.remote, {
          stop: this.quitting.signal,
        }),
      ).then(
        () => true,
        () => false,
      )
    );
  }

  async push(context: Context): Promise<void> {
    await context.tab.movingHead;
    const head = await readHead(context.gitPath, context.root).catch(
      () => undefined,
    );
    context.post({ type: 'pushing', running: true });
    let pushed: Pushed;
    try {
      pushed = await this.pushAfterRemoteWork(context, head);
    } finally {
      context.post({ type: 'pushing', running: false });
    }
    if (pushed === 'pushed') {
      await this.refreshes.refresh(context, undefined, refsAlone);
    } else if (pushed === 'rejected') {
      await this.fetch(context);
    }
  }

  private async pushAfterRemoteWork(
    context: Context,
    head: Head | undefined,
  ): Promise<Pushed> {
    if (head !== undefined && head.name === undefined) {
      foundUpstream(this.core.notify(context), { kind: 'detached' });
      return 'unchanged';
    }
    return this.afterRemoteWork(context.repository, () =>
      pushToUpstream(
        this.log,
        this.core.notify(context),
        context,
        this.quitting.signal,
        head?.name,
      ),
    );
  }

  async pullBranch(
    context: Context,
    name: string,
    picked: number | undefined,
  ): Promise<void> {
    const notify = this.core.notify(context);
    let fetched: Fetched | undefined;
    let moved = false;
    await this.runningOn(context, 'pullingBranch', name, async () => {
      const { refs, head } = await this.core.refsOf(context);
      if (!refs.some((ref) => ref.kind === 'branch' && ref.name === name)) {
        return;
      }
      if (head?.name === name) {
        await this.pull(context, picked);
        return;
      }
      const worktrees = await listWorktrees(context.gitPath, context.root);
      if (
        worktrees.some(
          (worktree) =>
            worktree.branch === name && !sameRoot(worktree.path, context.root),
        )
      ) {
        notify('info', strings.messages.checkedOutElsewhere(name));
        return;
      }
      if (await canPull(this.log, notify, context, name)) {
        fetched = await this.fetchShown(context);
        moved =
          (await this.fetchedForPull(context, fetched, name)) &&
          (await this.queueHeadMove(context, () =>
            this.moveToUpstream(context, name, picked),
          ));
      }
    });
    if (!moved && fetched) {
      await this.refreshFetched(context, fetched);
    }
  }

  private async moveToUpstream(
    context: Context,
    name: string,
    picked: number | undefined,
  ): Promise<boolean> {
    const { head } = await readRefs(context.gitPath, context.root);
    const checkedOut = head?.name === name;
    if (
      !(await fastForwardToUpstream(
        this.log,
        this.core.notify(context),
        context,
        checkedOut ? undefined : name,
      ))
    ) {
      return false;
    }
    if (checkedOut) {
      await this.refreshes.refresh(context);
      await context.tab.loadingHistory;
      await this.navigation.showHead(context, picked);
    } else {
      await this.refreshes.refresh(context, undefined, refsAlone);
    }
    return true;
  }

  private queueHeadMove<T>(
    context: Context,
    work: () => Promise<T>,
  ): Promise<T> {
    const { tab } = context;
    const moving = tab.movingHead.then(work);
    tab.movingHead = moving.then(
      () => undefined,
      () => undefined,
    );
    return moving;
  }

  async pushBranch(context: Context, name: string): Promise<void> {
    const { refs } = await this.core.refsOf(context);
    if (!refs.some((ref) => ref.kind === 'branch' && ref.name === name)) {
      return;
    }
    const pushed = await this.runningOn(context, 'pushingBranch', name, () =>
      this.afterRemoteWork(context.repository, () =>
        pushToUpstream(
          this.log,
          this.core.notify(context),
          context,
          this.quitting.signal,
          name,
        ),
      ),
    );
    if (pushed === 'pushed') {
      await this.refreshes.refresh(context, undefined, refsAlone);
    } else if (pushed === 'rejected') {
      await this.fetch(context);
    }
  }

  async pushTag(context: Context, name: string): Promise<void> {
    const { refs, remotes } = await this.core.refsOf(context);
    const tag = refs.find((ref) => ref.kind === 'tag' && ref.name === name);
    if (!tag) {
      return;
    }
    const remote = await pickTagRemote(
      this.log,
      this.core.notify(context),
      context,
      name,
      remotes,
    );
    if (remote === undefined) {
      return;
    }
    if (
      this.storage.remoteTagsOf(context.repository).get(remote)?.get(name) ===
      tag.commit
    ) {
      this.core.notify(context)(
        'info',
        strings.messages.tagAlreadyOnRemote(name, remote),
      );
      return;
    }
    const pushedTo = await this.runningOn(context, 'pushingTag', name, () =>
      this.afterRemoteWork(context.repository, () =>
        pushTag(
          this.log,
          this.core.notify(context),
          context,
          name,
          remote,
          this.quitting.signal,
        ),
      ),
    );
    const known =
      pushedTo === undefined
        ? undefined
        : this.storage.remoteTagsOf(context.repository).get(pushedTo);
    if (pushedTo === undefined || known === undefined) {
      return;
    }
    this.tagsRecorded++;
    await this.storage.setRemoteTags(
      context.repository,
      pushedTo,
      new Map([...known, [name, tag.commit]]),
    );
    await this.refreshes.refresh(context, undefined, refsAlone);
  }

  private async runningOn<T>(
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

  private async afterRemoteWork<T>(
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

  private remoteWork(repository: string): Promise<unknown> | undefined {
    const running = [
      this.fetches.get(repository)?.fetched,
      this.pushes.get(repository),
    ].filter((work) => work !== undefined);
    return running.length === 0 ? undefined : Promise.allSettled(running);
  }

  private async fetchRemotes(
    at: Fetchable,
    log: Log,
    notify: Notify,
    interactive = true,
  ): Promise<Fetched> {
    const { repository } = at;
    const { fetches } = this;
    const running = fetches.get(repository);
    const joined =
      running !== undefined && (!interactive || running.interactive);
    const fetching = joined ? running : this.startFetch(at, interactive);
    const result = await fetching.fetched;
    if (this.quitting.signal.aborted) {
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
    this.core.save(this.storage.recordFetch(repository, !fetched, Date.now()));
    const shownIn = this.core.sessionShowingRepository(repository);
    const live = shownIn && this.core.live(shownIn);
    if (live !== undefined) {
      this.postLastFetch(live, repository);
    }
    const notFetched = result.failed
      ? remotesNotFetched(gitErrorText(result.error))
      : [];
    if (fetched || notFetched.length > 0) {
      void this.shell().track(
        this.listTagsOfRemotes(at, interactive, notFetched),
      );
    }
    return result;
  }

  private async listTagsOfRemotes(
    { gitPath, root, repository }: Fetchable,
    interactive: boolean,
    notFetched: readonly string[] = [],
  ): Promise<void> {
    let remotes: string[];
    try {
      remotes = await listRemotes(gitPath, root);
      await this.storage.keepRemoteTags(repository, remotes);
    } catch (error) {
      this.log.warn(strings.log.listingRemoteTagsFailed(gitErrorText(error)));
      return;
    }
    let changed = false;
    let newlyKnown = false;
    for (const remote of remotes.filter((name) => !notFetched.includes(name))) {
      try {
        const recorded = this.tagsRecorded;
        const tags = await this.tagsOfRemote(
          gitPath,
          root,
          remote,
          interactive,
        );
        if (this.tagsRecorded !== recorded) {
          continue;
        }
        const known = this.storage.remoteTagsOf(repository).get(remote);
        if (!sameTags(known, tags)) {
          await this.storage.setRemoteTags(repository, remote, tags);
          changed ||= !sameTags(known ?? new Map(), tags);
          newlyKnown ||= known === undefined;
        }
      } catch (error) {
        if (this.quitting.signal.aborted) {
          return;
        }
        this.log.warn(
          strings.log.listingTagsOfRemoteFailed(remote, gitErrorText(error)),
        );
      }
    }
    if (changed) {
      await this.refreshRefsShown(repository);
    } else if (newlyKnown) {
      await this.resendRepositoryShown(repository);
    }
  }

  private tagsOfRemote(
    gitPath: string,
    root: string,
    remote: string,
    interactive: boolean,
  ): Promise<Map<string, string>> {
    return listRemoteTags(gitPath, root, remote, {
      interactive,
      stop: this.quitting.signal,
    });
  }

  private async resendRepositoryShown(repository: string): Promise<void> {
    const root = this.storage.worktreeOf(repository);
    const page = this.core.sessionShowing(root);
    const shown = page && (await this.core.context(page, root));
    if (page && shown) {
      await this.core.run(
        strings.log.refreshingFailed,
        page,
        () => this.core.sendRepository(shown, this.core.refsOf(shown)),
        root,
      );
    }
  }

  private async refreshRefsShown(repository: string): Promise<void> {
    const root = this.storage.worktreeOf(repository);
    const page = this.core.sessionShowing(root);
    const shown = page && (await this.core.context(page, root));
    if (page && shown) {
      await this.core.run(
        strings.log.refreshingFailed,
        page,
        () => this.refreshes.refresh(shown, undefined, refsAlone),
        root,
      );
    }
  }

  postLastFetch(session: Session, repository: string | undefined): void {
    session.post({
      type: 'lastFetch',
      ...(repository !== undefined && this.storage.lastFetchOf(repository)),
    });
  }

  private startFetch(at: Fetchable, interactive: boolean): Fetching {
    const { repository } = at;
    const { fetches } = this;
    const running = this.remoteWork(repository);
    const started: Fetching = {
      fetched: (running
        ? running.then(() => fetchAll(at, interactive, this.quitting.signal))
        : fetchAll(at, interactive, this.quitting.signal)
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
    const session = this.core.page();
    const worktree = this.storage.worktreeOf(repository);
    const root = (await isFolder(worktree)) ? worktree : repository;
    if (
      !session ||
      !this.core.hasRepository(repository) ||
      !(await isFolder(root))
    ) {
      return;
    }
    const reported = !this.fetchFailures.has(repository);
    const log: Log = {
      info: silent,
      warn: reported ? (message) => this.log.warn(message) : silent,
      error: reported ? (error) => this.log.error(error) : silent,
    };
    const notify: Notify = reported
      ? this.core.noticesOf(session, repository)
      : silent;
    const fetched = await this.fetchRemotes(
      { gitPath: this.gitPath, root, repository },
      log,
      notify,
      false,
    );
    if (fetched.failed || !fetched.changed) {
      return;
    }
    this.repositories.set(this.storage.worktreeOf(repository), repository);
    await this.refreshRefsShown(repository);
  }
}
