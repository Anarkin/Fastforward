import { aheadBehind, fastForward, onNoRef } from './git/branches';
import { gitErrorText } from './git/errorText';
import {
  checkoutNewBranch,
  fetchAllRemotes,
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
        await catchUp(log, notify, at, local, target.name);
      } else {
        await checkoutNewBranch(
          gitPath,
          root,
          local,
          `refs/remotes/${target.name}`,
        );
      }
    } else if (target.kind === 'branch') {
      await switchToBranch(gitPath, root, target.name);
    } else {
      await switchToCommit(
        gitPath,
        root,
        target.kind === 'commit' ? target.hash : `refs/tags/${target.name}`,
      );
    }
    log.info(strings.log.checkedOut(target.kind, label));
    const detached = detachedHead(before);
    if (detached) {
      await sayLeftBehind(log, notify, at, detached);
    }
    return true;
  } catch (error) {
    reportFailure(
      log,
      notify,
      strings.log.checkoutFailed(target.kind, label),
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
  const left = await onNoRef(gitPath, root, commit);
  if (left.length === 0) {
    return;
  }
  const message = strings.messages.leftBehind(
    left.length,
    left.slice(0, namedLeftBehind).map(shortHash).join(' '),
    left.length - namedLeftBehind,
  );
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
  try {
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

export type Fetched =
  | { readonly failed: false }
  | { readonly failed: true; readonly error: unknown };

export async function fetchAll(
  { gitPath, root }: RepositoryAt,
  interactive = true,
): Promise<Fetched> {
  try {
    await fetchAllRemotes(gitPath, root, { interactive });
    return { failed: false };
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
