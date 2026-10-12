import {
  aheadBehind,
  fastForward,
  onNoRef,
  readUpstream,
  type Upstream,
} from './git/branches';
import { gitErrorText } from './git/errorText';
import {
  checkoutNewBranch,
  fetchAllRemotes,
  listRemotes,
  pushBranch,
  readHead,
  readRefs,
  switchToBranch,
  switchToCommit,
} from './git/repository';
import type { CheckoutTarget } from './shared/protocol';
import { shortHash } from './shared/hashes';
import { hasRef, localBranchOf } from './shared/refNames';
import { strings } from './shared/strings';
import type { Log } from './log';
import { detachedHead } from './refs';

export type Notify = (level: 'info' | 'error', message: string) => void;

export interface RepositoryAt {
  readonly gitPath: string;
  readonly root: string;
}

export async function checkout(
  log: Log,
  notify: Notify,
  at: RepositoryAt,
  target: CheckoutTarget,
): Promise<boolean> {
  const { gitPath, root } = at;
  const label = target.kind === 'commit' ? target.hash : target.name;
  try {
    const before = await readHead(gitPath, root);
    if (target.kind === 'remote') {
      const { refs } = await readRefs(gitPath, root);
      const local = localBranchOf(refs, target.name);
      if (hasRef(refs, { kind: 'branch', name: local })) {
        await switchToBranch(gitPath, root, local);
        log.info(strings.log.checkedOut.branch(local));
        await catchUp(log, notify, at, local, target.name);
      } else {
        await checkoutNewBranch(
          gitPath,
          root,
          local,
          `refs/remotes/${target.name}`,
        );
        log.info(strings.log.checkedOutNewBranch(local, target.name));
      }
    } else if (target.kind === 'branch') {
      await switchToBranch(gitPath, root, target.name);
      log.info(strings.log.checkedOut.branch(target.name));
    } else {
      await switchToCommit(
        gitPath,
        root,
        target.kind === 'commit' ? target.hash : `refs/tags/${target.name}`,
      );
      log.info(strings.log.checkedOut[target.kind](label));
    }
    const detached = detachedHead(before);
    if (detached) {
      await sayLeftBehind(log, notify, at, detached);
    }
    return true;
  } catch (error) {
    reportFailure(
      log,
      notify,
      strings.log.checkoutFailed[target.kind](label),
      (reason) =>
        strings.messages.couldNotCheckOut(
          target.kind === 'commit' ? shortHash(label) : label,
          reason,
        ),
      error,
    );
    return false;
  }
}

const namedLeftBehind = 5;

async function sayLeftBehind(
  log: Log,
  notify: Notify,
  { gitPath, root }: RepositoryAt,
  commit: string,
): Promise<void> {
  let left: string[];
  try {
    left = await onNoRef(gitPath, root, commit);
  } catch (error) {
    log.error(strings.log.listingLeftBehindFailed);
    log.error(error);
    return;
  }
  if (left.length === 0) {
    return;
  }
  say(
    log,
    notify,
    strings.messages.leftBehind(
      left.length,
      left.slice(0, namedLeftBehind).map(shortHash),
      left.length - namedLeftBehind,
    ),
  );
}

function say(log: Log, notify: Notify, message: string): void {
  log.info(message);
  notify('info', message);
}

async function catchUp(
  log: Log,
  notify: Notify,
  { gitPath, root }: RepositoryAt,
  local: string,
  remote: string,
): Promise<void> {
  try {
    const { ahead, behind } = await aheadBehind(
      gitPath,
      root,
      `refs/heads/${local}`,
      `refs/remotes/${remote}`,
    );
    if (behind === 0) {
      return;
    }
    if (ahead > 0) {
      log.info(strings.log.diverged(local, remote));
      notify('info', strings.messages.diverged(local, remote));
      return;
    }
    if ((await readHead(gitPath, root))?.name !== local) {
      log.info(strings.log.notCheckedOut(local));
      return;
    }
    await fastForward(gitPath, root, `refs/remotes/${remote}`);
    log.info(strings.log.fastForwarded(local, remote));
  } catch (error) {
    reportFailure(
      log,
      notify,
      strings.log.fastForwardFailed(local, remote),
      (reason) => strings.messages.couldNotFastForward(local, remote, reason),
      error,
    );
  }
}

type FoundUpstream = Extract<Upstream, { kind: 'found' }>;

export function foundUpstream(
  notify: Notify,
  upstream: Upstream,
): FoundUpstream | undefined {
  if (upstream.kind === 'found') {
    return upstream;
  }
  notify('info', missingUpstream(upstream));
  return undefined;
}

function missingUpstream(upstream: Exclude<Upstream, FoundUpstream>): string {
  if (upstream.kind === 'detached') {
    return strings.messages.detachedUpstream;
  }
  return upstream.kind === 'none'
    ? strings.messages.noUpstream(upstream.branch)
    : strings.messages.upstreamGone(upstream.name, upstream.branch);
}

export async function canPull(
  log: Log,
  notify: Notify,
  { gitPath, root }: RepositoryAt,
): Promise<boolean> {
  try {
    const upstream = await readUpstream(gitPath, root);
    if (upstream.kind === 'detached' || upstream.kind === 'none') {
      foundUpstream(notify, upstream);
      return false;
    }
    return true;
  } catch (error) {
    reportPullFailure(log, notify, error);
    return false;
  }
}

export async function fastForwardToUpstream(
  log: Log,
  notify: Notify,
  { gitPath, root }: RepositoryAt,
): Promise<boolean> {
  try {
    const upstream = foundUpstream(notify, await readUpstream(gitPath, root));
    if (!upstream) {
      return false;
    }
    const { branch, name, commit } = upstream;
    const { ahead, behind } = await aheadBehind(
      gitPath,
      root,
      `refs/heads/${branch}`,
      commit,
    );
    if (behind === 0) {
      say(
        log,
        notify,
        ahead === 0
          ? strings.messages.upToDateWith(branch, name)
          : strings.messages.aheadOf(branch, name),
      );
      return false;
    }
    if (ahead > 0) {
      say(log, notify, strings.messages.cannotFastForward(branch, name));
      return false;
    }
    await fastForward(gitPath, root, commit);
    log.info(strings.log.fastForwarded(branch, name));
    return true;
  } catch (error) {
    reportPullFailure(log, notify, error);
    return false;
  }
}

export type Pushed = 'pushed' | 'rejected' | 'unchanged';

const remoteMovedOn = /\[rejected\][^\n]*\((fetch first|non-fast-forward)\)/;

export async function pushToUpstream(
  log: Log,
  notify: Notify,
  { gitPath, root }: RepositoryAt,
  stop: AbortSignal,
): Promise<Pushed> {
  try {
    const upstream = await readUpstream(gitPath, root);
    if (upstream.kind === 'none') {
      return await publish(
        log,
        notify,
        { gitPath, root },
        upstream.branch,
        stop,
      );
    }
    const found = foundUpstream(notify, upstream);
    if (!found) {
      return 'unchanged';
    }
    const { branch, name, commit, remote, remoteRef } = found;
    if (remote === '.') {
      notify('info', strings.messages.localUpstream(branch, name));
      return 'unchanged';
    }
    const { ahead, behind } = await aheadBehind(
      gitPath,
      root,
      `refs/heads/${branch}`,
      commit,
    );
    if (ahead === 0) {
      say(
        log,
        notify,
        behind === 0
          ? strings.messages.upToDateWith(branch, name)
          : strings.messages.behind(branch, name),
      );
      return 'unchanged';
    }
    if (behind > 0) {
      say(log, notify, strings.messages.cannotPushDiverged(branch, name));
      return 'unchanged';
    }
    try {
      await pushBranch(gitPath, root, remote, branch, remoteRef, { stop });
    } catch (error) {
      if (remoteMovedOn.test(gitErrorText(error))) {
        say(log, notify, strings.messages.remoteMovedOn(branch, name));
        return 'rejected';
      }
      throw error;
    }
    say(log, notify, strings.messages.pushed(branch, name));
    return 'pushed';
  } catch (error) {
    reportFailure(
      log,
      notify,
      strings.log.pushFailed,
      strings.messages.couldNotPush,
      error,
    );
    return 'unchanged';
  }
}

async function publish(
  log: Log,
  notify: Notify,
  { gitPath, root }: RepositoryAt,
  branch: string,
  stop: AbortSignal,
): Promise<Pushed> {
  const remotes = await listRemotes(gitPath, root);
  const [remote] = remotes;
  if (remote === undefined || remotes.length > 1) {
    notify(
      'info',
      remote === undefined
        ? strings.messages.noRemote(branch)
        : strings.messages.severalRemotes(branch),
    );
    return 'unchanged';
  }
  await pushBranch(gitPath, root, remote, branch, `refs/heads/${branch}`, {
    publish: true,
    stop,
  });
  say(log, notify, strings.messages.published(branch, `${remote}/${branch}`));
  return 'pushed';
}

function reportPullFailure(log: Log, notify: Notify, error: unknown): void {
  reportFailure(
    log,
    notify,
    strings.log.pullFailed,
    strings.messages.couldNotPull,
    error,
  );
}

export type Fetched =
  | { readonly failed: false; readonly changed: boolean }
  | { readonly failed: true; readonly error: unknown };

export async function fetchAll(
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

export function reportFetched(
  log: Log,
  notify: Notify,
  fetched: Fetched,
): boolean {
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

function reportFailure(
  log: Log,
  notify: Notify,
  failed: string,
  message: (reason: string) => string,
  error: unknown,
): void {
  log.error(failed);
  log.error(error);
  notify('error', message(gitErrorText(error)));
}
