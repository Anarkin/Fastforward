import { aheadBehind, fastForward } from './git/branches';
import { gitErrorText } from './git/errorText';
import {
  checkoutNewBranch,
  checkoutRef,
  fetchAllRemotes,
  readRefs,
} from './git/repository';
import type { CheckoutTarget } from './shared/protocol';
import { hasRef, withoutRemote } from './shared/refNames';
import type { Log } from './log';

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
    if (target.kind === 'remote') {
      const local = withoutRemote(target.name);
      const { refs } = await readRefs(gitPath, root);
      if (hasRef(refs, { kind: 'branch', name: local })) {
        await checkoutRef(gitPath, root, local);
        await catchUp(log, notify, at, local, target.name);
      } else {
        await checkoutNewBranch(gitPath, root, local, target.name);
      }
    } else {
      await checkoutRef(
        gitPath,
        root,
        target.kind === 'commit'
          ? target.hash
          : target.kind === 'tag'
            ? `refs/tags/${target.name}`
            : target.name,
      );
    }
    log.info(`Checked out ${target.kind} ${label}`);
    return true;
  } catch (error) {
    reportFailure(
      log,
      notify,
      `Checking out ${target.kind} ${label} failed`,
      `Couldn't check out ${label}.`,
      error,
    );
    return false;
  }
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
    log.info(`${local} and ${remote} have diverged, not fast-forwarding`);
    notify(
      'info',
      `Switched to ${local}, which has diverged from ${remote}; pull to combine them.`,
    );
    return;
  }
  try {
    await fastForward(gitPath, root, `refs/remotes/${remote}`);
    log.info(`Fast-forwarded ${local} to ${remote}`);
  } catch (error) {
    reportFailure(
      log,
      notify,
      `Fast-forwarding ${local} to ${remote} failed`,
      `Switched to ${local}, but couldn't fast-forward it to ${remote}.`,
      error,
    );
  }
}

export async function fetchAll(
  log: Log,
  notify: Notify,
  { gitPath, root }: RepositoryAt,
): Promise<boolean> {
  try {
    await fetchAllRemotes(gitPath, root);
    log.info('Fetched every remote');
    return true;
  } catch (error) {
    reportFailure(log, notify, 'fetch failed', "Couldn't fetch.", error);
    return false;
  }
}

function reportFailure(
  log: Log,
  notify: Notify,
  failed: string,
  message: string,
  error: unknown,
): void {
  const details = gitErrorText(error);
  log.error(failed);
  log.error(details);
  notify('error', `${message} ${details}`);
}
