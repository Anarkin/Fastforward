import { aheadBehind, fastForward, onNoRef } from './branches';
import { readHead, readRefs } from './refReads';
import { checkoutNewBranch, switchToBranch, switchToCommit } from './switches';
import type { CheckoutTarget } from '../shared/protocol';
import { shortHash } from '../../../lib/shared/hashes';
import { hasRef, localBranchOf } from '../shared/refNames';
import { strings } from '../../../lib/shared/strings';
import type { Log } from '../../../shell/main/log';
import {
  reportFailure,
  say,
  type Notify,
  type RepositoryAt,
} from './operations';
import { detachedHead } from './refs';

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
