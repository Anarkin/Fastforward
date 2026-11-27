import { gitErrorText } from '../../../lib/main/errorText';
import { listRemotes } from './refReads';
import { listRemoteTags } from './transfers';
import { pickTagRemote, pushTag } from './push';
import type { RefInfo } from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';
import { type Fetchable, type Context, refsAlone } from './tabContext';
import type { RemoteAccess } from './remoteWork';

export function remoteTagRefs(
  lists: ReadonlyMap<string, ReadonlyMap<string, string>>,
  remotes: readonly string[],
): RefInfo[] {
  return remotes.flatMap((remote) =>
    [...(lists.get(remote) ?? [])].map(([tag, commit]): RefInfo => ({
      kind: 'remote-tag',
      name: `${remote}/${tag}`,
      commit,
      remote,
    })),
  );
}

function sameTags(
  a: ReadonlyMap<string, string> | undefined,
  b: ReadonlyMap<string, string>,
): boolean {
  return (
    a !== undefined &&
    a.size === b.size &&
    [...b].every(([tag, commit]) => a.get(tag) === commit)
  );
}

export class PushedTags {
  private readonly counts = new Map<string, number>();

  private static keyOf(repository: string, remote: string): string {
    return JSON.stringify([repository, remote]);
  }

  countOf(repository: string, remote: string): number {
    return this.counts.get(PushedTags.keyOf(repository, remote)) ?? 0;
  }

  record(repository: string, remote: string): void {
    const key = PushedTags.keyOf(repository, remote);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
}

export class RemoteTags {
  private readonly pushed = new PushedTags();

  constructor(private readonly access: RemoteAccess) {}

  async pushTag(context: Context, name: string): Promise<void> {
    const { refs, remotes } = await this.access.core.refsOf(context);
    const tag = refs.find((ref) => ref.kind === 'tag' && ref.name === name);
    if (!tag) {
      return;
    }
    const remote = await pickTagRemote(
      this.access.log,
      this.access.core.notify(context),
      context,
      name,
      remotes,
    );
    if (remote === undefined) {
      return;
    }
    if (
      this.access.storage.remoteTags
        .remoteTagsOf(context.repository)
        .get(remote)
        ?.get(name) === tag.commit
    ) {
      this.access.core.notify(context)(
        'info',
        strings.messages.tagAlreadyOnRemote(name, remote),
      );
      return;
    }
    const pushedTo = await this.access.remoteWork.runningOn(
      context,
      'pushingTag',
      name,
      () =>
        this.access.remoteWork.afterRemoteWork(context.repository, () =>
          pushTag(
            this.access.log,
            this.access.core.notify(context),
            context,
            name,
            remote,
            this.access.quitting.signal,
          ),
        ),
    );
    const known =
      pushedTo === undefined
        ? undefined
        : this.access.storage.remoteTags
            .remoteTagsOf(context.repository)
            .get(pushedTo);
    if (pushedTo === undefined || known === undefined) {
      return;
    }
    this.pushed.record(context.repository, pushedTo);
    await this.access.storage.remoteTags.setRemoteTags(
      context.repository,
      pushedTo,
      new Map([...known, [name, tag.commit]]),
    );
    await this.access.refreshes.refresh(context, undefined, refsAlone);
  }

  async listTagsOfRemotes(
    { gitPath, root, repository }: Fetchable,
    interactive: boolean,
    notFetched: readonly string[] = [],
  ): Promise<void> {
    let remotes: string[];
    try {
      remotes = await listRemotes(gitPath, root);
      await this.access.storage.remoteTags.keepRemoteTags(repository, remotes);
    } catch (error) {
      this.access.log.warn(
        strings.log.listingRemoteTagsFailed(gitErrorText(error)),
      );
      return;
    }
    let changed = false;
    let newlyKnown = false;
    for (const remote of remotes.filter((name) => !notFetched.includes(name))) {
      try {
        const recorded = this.pushed.countOf(repository, remote);
        const tags = await this.tagsOfRemote(
          gitPath,
          root,
          remote,
          interactive,
        );
        if (this.pushed.countOf(repository, remote) !== recorded) {
          continue;
        }
        const known = this.access.storage.remoteTags
          .remoteTagsOf(repository)
          .get(remote);
        if (!sameTags(known, tags)) {
          await this.access.storage.remoteTags.setRemoteTags(
            repository,
            remote,
            tags,
          );
          changed ||= !sameTags(known ?? new Map(), tags);
          newlyKnown ||= known === undefined;
        }
      } catch (error) {
        if (this.access.quitting.signal.aborted) {
          return;
        }
        this.access.log.warn(
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
      stop: this.access.quitting.signal,
    });
  }

  private async resendRepositoryShown(repository: string): Promise<void> {
    const root = this.access.storage.worktreeOf(repository);
    const page = this.access.core.sessionShowing(root);
    const shown = page && (await this.access.core.context(page, root));
    if (page && shown) {
      await this.access.core.run(
        strings.log.refreshingFailed,
        page,
        () =>
          this.access.core.sendRepository(
            shown,
            this.access.core.refsOf(shown),
          ),
        root,
      );
    }
  }

  async refreshRefsShown(repository: string): Promise<void> {
    const root = this.access.storage.worktreeOf(repository);
    const page = this.access.core.sessionShowing(root);
    const shown = page && (await this.access.core.context(page, root));
    if (page && shown) {
      await this.access.core.run(
        strings.log.refreshingFailed,
        page,
        () => this.access.refreshes.refresh(shown, undefined, refsAlone),
        root,
      );
    }
  }
}
