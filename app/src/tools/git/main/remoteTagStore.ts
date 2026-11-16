import { isFullHash } from '../../../lib/shared/hashes';
import { isObject } from '../../../lib/main/json';
import type { Store } from '../../../shell/main/stateFile';
import { keyOf, recordOf, withoutRoots } from './rootRecords';

export const remoteTagsKey = 'remoteTags';
const noRemoteTags: ReadonlyMap<
  string,
  ReadonlyMap<string, string>
> = new Map();

export class RemoteTagStore {
  private readonly parsedTags = new WeakMap<
    object,
    ReadonlyMap<string, string>
  >();

  constructor(private readonly state: Store) {}

  remoteTagsOf(
    repository: string,
  ): ReadonlyMap<string, ReadonlyMap<string, string>> {
    const all = this.allRemoteTags;
    const remotes = all[keyOf(all, repository)];
    if (!isObject(remotes)) {
      return noRemoteTags;
    }
    return new Map(
      Object.entries(remotes).flatMap(
        ([remote, tags]): [string, ReadonlyMap<string, string>][] =>
          isObject(tags) ? [[remote, this.tagsOf(tags)]] : [],
      ),
    );
  }

  private tagsOf(saved: Record<string, unknown>): ReadonlyMap<string, string> {
    const known = this.parsedTags.get(saved);
    if (known !== undefined) {
      return known;
    }
    const tags = new Map(
      Object.entries(saved).filter(
        (tag): tag is [string, string] =>
          typeof tag[1] === 'string' && isFullHash(tag[1]),
      ),
    );
    this.parsedTags.set(saved, tags);
    return tags;
  }

  async setRemoteTags(
    repository: string,
    remote: string,
    tags: ReadonlyMap<string, string>,
  ): Promise<void> {
    const all = this.allRemoteTags;
    const key = keyOf(all, repository);
    await this.state.update(remoteTagsKey, {
      ...all,
      [key]: { ...recordOf(all[key]), [remote]: Object.fromEntries(tags) },
    });
  }

  async keepRemoteTags(
    repository: string,
    remotes: readonly string[],
  ): Promise<void> {
    const all = this.allRemoteTags;
    const key = keyOf(all, repository);
    const kept = Object.entries(recordOf(all[key])).filter(([remote]) =>
      remotes.includes(remote),
    );
    if (kept.length === Object.keys(recordOf(all[key])).length) {
      return;
    }
    await this.state.update(remoteTagsKey, {
      ...all,
      [key]: Object.fromEntries(kept),
    });
  }

  async forget(repository: string): Promise<void> {
    await withoutRoots(this.state, remoteTagsKey, [repository]);
  }

  private get allRemoteTags(): Record<string, unknown> {
    return recordOf(this.state.get(remoteTagsKey));
  }
}
