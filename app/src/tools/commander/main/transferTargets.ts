import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Sentence } from '../../../lib/shared/sentences';
import { strings } from '../../../lib/shared/strings';
import { folderKey } from '../shared/paths';

export function refusedTarget(
  sources: readonly string[],
  target: string,
  platform: NodeJS.Platform,
): Sentence | undefined {
  const key = (each: string) => folderKey(path.resolve(each), platform);
  if (sources.some((source) => key(path.dirname(source)) === key(target))) {
    return strings.commander.alreadyIn(target);
  }
  const intoItself = sources.find((source) => {
    const relative = path.relative(key(source), key(target));
    return (
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    );
  });
  return intoItself === undefined
    ? undefined
    : strings.commander.intoItself(intoItself);
}

const real = (file: string) => fs.promises.realpath(file).catch(() => file);

export async function refusedTargetOnDisk(
  sources: readonly string[],
  target: string,
  platform: NodeJS.Platform,
): Promise<Sentence | undefined> {
  return (
    refusedTarget(sources, target, platform) ??
    refusedTarget(
      await Promise.all(sources.map(real)),
      await real(target),
      platform,
    )
  );
}
