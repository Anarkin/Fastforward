import { readUpstream } from './branches';
import { readHead, readRefs, type Head } from './refReads';
import { fetchRemote } from './transfers';
import { listWorktrees } from './repositoryLocation';
import { checkout } from './checkout';
import type { Fetched, Fetches } from './fetches';
import { foundUpstream } from './operations';
import { canPull, fastForwardToUpstream } from './pull';
import { pushToUpstream, type Pushed } from './push';
import { isFullHash } from '../shared/hashes';
import { hasRef } from '../shared/refNames';
import type { CheckoutTarget, TabMessage } from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';
import { sameRoot } from '../../../lib/main/paths';
import { type Context, notInHistory, refsAlone } from './tabContext';
import type { RemoteTags } from './remoteTags';
import type { RemoteAccess } from './remoteWork';

export type RemoteMessage = Extract<
  TabMessage,
  {
    readonly type:
      | 'checkout'
      | 'fetch'
      | 'pull'
      | 'push'
      | 'pushTag'
      | 'pullBranch'
      | 'pushBranch';
  }
>;

export class Remotes {
  constructor(
    private readonly access: RemoteAccess,
    private readonly fetches: Fetches,
    private readonly remoteTags: RemoteTags,
  ) {}

  async receive(
    context: Context,
    message: RemoteMessage,
    picked: number | undefined,
  ): Promise<void> {
    switch (message.type) {
      case 'checkout':
        await this.checkout(context, message.target, picked);
        return;
      case 'fetch':
        await this.fetches.fetch(context);
        return;
      case 'pull':
        await this.pull(context, picked);
        return;
      case 'push':
        await this.push(context);
        return;
      case 'pushTag':
        await this.remoteTags.pushTag(context, message.name);
        return;
      case 'pullBranch':
        await this.pullBranch(context, message.name, picked);
        return;
      case 'pushBranch':
        await this.pushBranch(context, message.name);
        return;
      default:
        return message satisfies never;
    }
  }

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
      !(await checkout(
        this.access.log,
        this.access.core.notify(context),
        context,
        target,
      ))
    ) {
      return;
    }
    await this.access.refreshes.refresh(context);
    await context.tab.loadingHistory;
    await this.access.commitNavigation.showHead(context, picked);
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
    this.access.core.notify(context)(
      'error',
      strings.messages.noRefToCheckOut(target.name),
    );
    return false;
  }

  pull(context: Context, picked: number | undefined): Promise<void> {
    return this.queueHeadMove(context, () => this.pullNow(context, picked));
  }

  private async pullNow(
    context: Context,
    picked: number | undefined,
  ): Promise<void> {
    const notify = this.access.core.notify(context);
    context.post({ type: 'pulling', running: true });
    let fetched: Fetched | undefined;
    let pulled = false;
    try {
      if (await canPull(this.access.log, notify, context)) {
        fetched = await this.fetches.fetchShown(context);
        pulled =
          (await this.fetchedForPull(context, fetched)) &&
          (await fastForwardToUpstream(this.access.log, notify, context));
      }
    } finally {
      context.post({ type: 'pulling', running: false });
    }
    if (pulled) {
      await this.access.refreshes.refresh(context);
      await context.tab.loadingHistory;
      await this.access.commitNavigation.showHead(context, picked);
    } else if (fetched) {
      await this.fetches.refreshFetched(context, fetched);
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
      this.access.remoteWork
        .afterRemoteWork(context.repository, () =>
          fetchRemote(context.gitPath, context.root, upstream.remote, {
            stop: this.access.quitting.signal,
          }),
        )
        .then(
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
      await this.access.refreshes.refresh(context, undefined, refsAlone);
    } else if (pushed === 'rejected') {
      await this.fetches.fetch(context);
    }
  }

  private async pushAfterRemoteWork(
    context: Context,
    head: Head | undefined,
  ): Promise<Pushed> {
    if (head !== undefined && head.name === undefined) {
      foundUpstream(this.access.core.notify(context), { kind: 'detached' });
      return 'unchanged';
    }
    return this.access.remoteWork.afterRemoteWork(context.repository, () =>
      pushToUpstream(
        this.access.log,
        this.access.core.notify(context),
        context,
        this.access.quitting.signal,
        head?.name,
      ),
    );
  }

  async pullBranch(
    context: Context,
    name: string,
    picked: number | undefined,
  ): Promise<void> {
    const notify = this.access.core.notify(context);
    let fetched: Fetched | undefined;
    let moved = false;
    await this.access.remoteWork.runningOn(
      context,
      'pullingBranch',
      name,
      async () => {
        const { refs, head } = await this.access.core.refsOf(context);
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
              worktree.branch === name &&
              !sameRoot(worktree.path, context.root),
          )
        ) {
          notify('info', strings.messages.checkedOutElsewhere(name));
          return;
        }
        if (await canPull(this.access.log, notify, context, name)) {
          fetched = await this.fetches.fetchShown(context);
          moved =
            (await this.fetchedForPull(context, fetched, name)) &&
            (await this.queueHeadMove(context, () =>
              this.moveToUpstream(context, name, picked),
            ));
        }
      },
    );
    if (!moved && fetched) {
      await this.fetches.refreshFetched(context, fetched);
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
        this.access.log,
        this.access.core.notify(context),
        context,
        checkedOut ? undefined : name,
      ))
    ) {
      return false;
    }
    if (checkedOut) {
      await this.access.refreshes.refresh(context);
      await context.tab.loadingHistory;
      await this.access.commitNavigation.showHead(context, picked);
    } else {
      await this.access.refreshes.refresh(context, undefined, refsAlone);
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
    const { refs } = await this.access.core.refsOf(context);
    if (!refs.some((ref) => ref.kind === 'branch' && ref.name === name)) {
      return;
    }
    const pushed = await this.access.remoteWork.runningOn(
      context,
      'pushingBranch',
      name,
      () =>
        this.access.remoteWork.afterRemoteWork(context.repository, () =>
          pushToUpstream(
            this.access.log,
            this.access.core.notify(context),
            context,
            this.access.quitting.signal,
            name,
          ),
        ),
    );
    if (pushed === 'pushed') {
      await this.access.refreshes.refresh(context, undefined, refsAlone);
    } else if (pushed === 'rejected') {
      await this.fetches.fetch(context);
    }
  }
}
