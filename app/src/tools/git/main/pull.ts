import { aheadBehind, fastForward, moveBranch, readUpstream } from './branches';
import { strings } from '../../../lib/shared/strings';
import type { Log } from '../../../shell/main/log';
import {
  foundUpstream,
  reportFailure,
  say,
  type Notify,
  type RepositoryAt,
} from './operations';

export async function canPull(
  log: Log,
  notify: Notify,
  { gitPath, root }: RepositoryAt,
  branchNamed?: string,
): Promise<boolean> {
  try {
    const upstream = await readUpstream(gitPath, root, branchNamed);
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
  branchNamed?: string,
): Promise<boolean> {
  try {
    const upstream = foundUpstream(
      notify,
      await readUpstream(gitPath, root, branchNamed),
    );
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
    if (branchNamed === undefined) {
      await fastForward(gitPath, root, commit);
    } else {
      const moved = await moveBranch(gitPath, root, branchNamed, commit);
      if (moved !== 'moved') {
        say(
          log,
          notify,
          moved === 'inUse'
            ? strings.messages.branchInUse(branch)
            : strings.messages.cannotFastForward(branch, name),
        );
        return false;
      }
    }
    log.info(strings.log.fastForwarded(branch, name));
    return true;
  } catch (error) {
    reportPullFailure(log, notify, error);
    return false;
  }
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
