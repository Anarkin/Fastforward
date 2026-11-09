import { strings, type Sentence } from '../../../shared/strings';
import { nameProblem } from '../shared/names';
import { folderKey } from '../shared/paths';
import type { Entry } from '../shared/protocol';

export function newFolderProblem(
  name: string,
  listed: readonly Entry[] | undefined,
  platform: string | undefined,
): Sentence | undefined {
  const problem = nameProblem(name, platform);
  if (problem !== undefined) {
    return problem;
  }
  const key = folderKey(name, platform);
  return listed?.some((entry) => folderKey(entry.name, platform) === key)
    ? strings.commander.nameThere
    : undefined;
}

export function renameProblem(
  to: string,
  name: string,
  listed: readonly Entry[] | undefined,
  platform: string | undefined,
): Sentence | undefined {
  const problem = nameProblem(to, platform);
  if (problem !== undefined) {
    return problem;
  }
  const key = folderKey(to, platform);
  return key !== folderKey(name, platform) &&
    listed?.some((entry) => folderKey(entry.name, platform) === key) === true
    ? strings.commander.nameThere
    : undefined;
}

export function renamedPart(name: string, folder: boolean): number {
  const dot = name.lastIndexOf('.');
  return !folder && dot > 0 ? dot : name.length;
}

export function baseNameOf(key: string, platform: string | undefined): string {
  return key.split(platform === 'win32' ? /[\\/]/ : '/').at(-1) ?? key;
}
