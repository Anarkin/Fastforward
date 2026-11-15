import { gitErrorText } from './errorText';
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

export class RemoteTags {
  private tagsRecorded = 0;

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
      this.access.storage
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
        : this.access.storage.remoteTagsOf(context.repository).get(pushedTo);
    if (pushedTo === undefined || known === undefined) {
      return;
    }
    this.tagsRecorded++;
    await this.access.storage.setRemoteTags(
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
      await this.access.storage.keepRemoteTags(repository, remotes);
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
        const known = this.access.storage.remoteTagsOf(repository).get(remote);
        if (!sameTags(known, tags)) {
          await this.access.storage.setRemoteTags(repository, remote, tags);
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
