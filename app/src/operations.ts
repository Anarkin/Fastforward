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
    const before = await readHead(gitPath, root);
    if (target.kind === 'remote') {
      const local = withoutRemote(target.name);
      const { refs } = await readRefs(gitPath, root);
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
    log.info(`Checked out ${target.kind} ${label}`);
    if (before && !before.name && before.commit) {
      await sayLeftBehind(log, notify, at, before.commit);
    }
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
  const named = left.slice(0, namedLeftBehind).map(shortHash).join(' ');
  const more = left.length - namedLeftBehind;
  const message = `Left ${left.length === 1 ? '1 commit' : `${left.length} commits`} behind on no branch or tag: ${named}${more > 0 ? ` and ${more} more` : ''}`;
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
      'fetch failed',
      "Couldn't fetch.",
      fetched.error,
    );
    return false;
  }
  log.info('Fetched every remote');
  return true;
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
