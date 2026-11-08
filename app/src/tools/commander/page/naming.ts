import { strings } from '../../../shared/strings';
import { nameProblem } from '../shared/names';
import { folderKey } from '../shared/paths';
import type { Entry } from '../shared/protocol';

export function newFolderProblem(
  name: string,
  listed: readonly Entry[] | undefined,
  platform: string | undefined,
): string | undefined {
  const problem = nameProblem(name, platform);
  if (problem !== undefined) {
    return problem;
  }
  const key = folderKey(name, platform);
  return listed?.some((entry) => folderKey(entry.name, platform) === key)
    ? strings.commander.nameTaken(name)
    : undefined;
}
