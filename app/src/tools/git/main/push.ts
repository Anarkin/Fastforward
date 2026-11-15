import { aheadBehind, readUpstream } from './branches';
import { readPushTarget } from './pushTarget';
import { gitErrorText } from './errorText';
import { listRemotes, readHead } from './refReads';
import { pushRef } from './transfers';
import { strings } from '../../../lib/shared/strings';
import type { Log } from '../../../shell/main/log';
import {
  foundUpstream,
  reportFailure,
  say,
  type Notify,
  type RepositoryAt,
} from './operations';

export type Pushed = 'pushed' | 'rejected' | 'unchanged';

const remoteMovedOn = /\[rejected\][^\n]*\((fetch first|non-fast-forward)\)/;

export async function pushToUpstream(
  log: Log,
  notify: Notify,
  { gitPath, root }: RepositoryAt,
  stop: AbortSignal,
  branchNamed?: string,
): Promise<Pushed> {
  try {
    const target = await readPushTarget(gitPath, root, branchNamed);
    if (target.kind === 'none') {
      return await publish(log, notify, { gitPath, root }, target.branch, stop);
    }
    if (target.kind === 'detached' || target.kind === 'gone') {
      foundUpstream(notify, target);
      return 'unchanged';
    }
    if (target.kind === 'local') {
      notify(
        'info',
        strings.messages.localUpstream(target.branch, target.name),
      );
      return 'unchanged';
    }
    if (target.kind === 'refused') {
      notify(
        'info',
        target.why === 'otherName'
          ? strings.messages.upstreamOtherName(target.branch, target.name)
          : strings.messages.pushesNothing(target.branch),
      );
      return 'unchanged';
    }
    const { branch, name, commit, remote, remoteRef } = target;
    if (commit !== undefined) {
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
    }
    try {
      await pushRef(gitPath, root, remote, `refs/heads/${branch}`, remoteRef, {
        stop,
      });
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
  await pushRef(
    gitPath,
    root,
    remote,
    `refs/heads/${branch}`,
    `refs/heads/${branch}`,
    {
      publish: true,
      stop,
    },
  );
  say(log, notify, strings.messages.published(branch, `${remote}/${branch}`));
  return 'pushed';
}

export async function tagRemoteOf(
  gitPath: string,
  root: string,
  remotes: readonly string[],
): Promise<string | undefined> {
  if (remotes.length <= 1) {
    return remotes[0];
  }
  const upstream = await readUpstream(gitPath, root);
  return upstream.kind === 'found' && upstream.remote !== '.'
    ? upstream.remote
    : undefined;
}

const tagElsewhere = /\[rejected\][^\n]*\(already exists\)/;

export async function pickTagRemote(
  log: Log,
  notify: Notify,
  { gitPath, root }: RepositoryAt,
  tag: string,
  remotes: readonly string[],
): Promise<string | undefined> {
  try {
    const remote = await tagRemoteOf(gitPath, root, remotes);
    if (remote === undefined) {
      const head = await readHead(gitPath, root);
      notify('info', strings.messages.noTagRemote(tag, head?.name));
    }
    return remote;
  } catch (error) {
    reportFailure(
      log,
      notify,
      strings.log.pushFailed,
      strings.messages.couldNotPush,
      error,
    );
    return undefined;
  }
}

export async function pushTag(
  log: Log,
  notify: Notify,
  { gitPath, root }: RepositoryAt,
  tag: string,
  remote: string,
  stop: AbortSignal,
): Promise<string | undefined> {
  try {
    const ref = `refs/tags/${tag}`;
    try {
      await pushRef(gitPath, root, remote, ref, ref, { stop });
    } catch (error) {
      if (tagElsewhere.test(gitErrorText(error))) {
        say(log, notify, strings.messages.tagElsewhere(tag, remote));
        return undefined;
      }
      throw error;
    }
    say(log, notify, strings.messages.pushedTag(tag, remote));
    return remote;
  } catch (error) {
    reportFailure(
      log,
      notify,
      strings.log.pushFailed,
      strings.messages.couldNotPush,
      error,
    );
    return undefined;
  }
}
