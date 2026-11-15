import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import {
  extensionKey,
  type FileColor,
  type GroupStandIn,
} from '../../../lib/shared/fileColors';

const standInTwice: Readonly<
  Record<GroupStandIn, (first: number, again: number) => Sentence>
> = {
  languages: strings.settings.fileColorLanguagesTwice,
  executables: strings.settings.fileColorExecutablesTwice,
};

export function fileColorProblems(groups: readonly FileColor[]): Sentence[] {
  const firstGroup = new Map<string, number>();
  const firstStandIn = new Map<GroupStandIn, number>();
  return groups.flatMap(({ extensions }, group) => {
    if (typeof extensions === 'string') {
      const first = firstStandIn.get(extensions);
      if (first === undefined) {
        firstStandIn.set(extensions, group);
        return [];
      }
      return [standInTwice[extensions](first, group)];
    }
    return extensions.flatMap((extension) => {
      const key = extensionKey(extension);
      if (key === '') {
        return [strings.settings.fileColorEmpty(group)];
      }
      const first = firstGroup.get(key);
      if (first === undefined) {
        firstGroup.set(key, group);
        return [];
      }
      return first === group
        ? []
        : [strings.settings.fileColorTwice(key, first, group)];
    });
  });
}
