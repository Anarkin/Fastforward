import { type RefInfo } from '../shared/protocol';
import { withoutRemote } from '../shared/refNames';

function tagOf(ref: RefInfo): string {
  return withoutRemote(ref.name, ref.remote);
}

export function inPairs(refs: readonly RefInfo[]): RefInfo[] {
  const remoteTags = refs.filter((ref) => ref.kind === 'remote-tag');
  const localTags = new Set(
    refs.filter((ref) => ref.kind === 'tag').map((ref) => ref.name),
  );
  return [
    ...refs.flatMap((ref) =>
      ref.kind === 'remote-tag'
        ? []
        : ref.kind === 'tag'
          ? [ref, ...remoteTags.filter((other) => tagOf(other) === ref.name)]
          : [ref],
    ),
    ...remoteTags.filter((ref) => !localTags.has(tagOf(ref))),
  ];
}
