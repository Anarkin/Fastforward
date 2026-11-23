import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
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

export function newFileProblem(
  name: string,
  listed: readonly Entry[] | undefined,
  platform: string | undefined,
): Sentence | undefined {
  const problem = nameProblem(name, platform);
  if (problem !== undefined) {
    return problem;
  }
  const key = folderKey(name, platform);
  return listed?.some(
    (entry) => entry.folder && folderKey(entry.name, platform) === key,
  )
    ? strings.commander.folderThere
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

export function copyName(
  name: string,
  folder: boolean,
  listed: readonly Entry[] | undefined,
  platform: string | undefined,
): string {
  const taken = new Set(
    (listed ?? []).map((entry) => folderKey(entry.name, platform)),
  );
  if (!taken.has(folderKey(name, platform))) {
    return name;
  }
  const dot = folder ? -1 : name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let number = 2; ; number++) {
    const candidate = `${stem} (${number})${extension}`;
    if (!taken.has(folderKey(candidate, platform))) {
      return candidate;
    }
  }
}

export function renamedPart(name: string, folder: boolean): number {
  const dot = name.lastIndexOf('.');
  return !folder && dot > 0 ? dot : name.length;
}

export function baseNameOf(key: string, platform: string | undefined): string {
  return key.split(platform === 'win32' ? /[\\/]/ : '/').at(-1) ?? key;
}
