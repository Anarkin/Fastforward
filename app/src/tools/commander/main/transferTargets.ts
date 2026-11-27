import { fs } from '../../../lib/main/files';
import * as path from 'node:path';
import type { Sentence } from '../../../lib/shared/sentences';
import { strings } from '../../../lib/shared/strings';
import { folderKey } from '../shared/paths';

export function nameShared(
  sources: readonly string[],
  platform: NodeJS.Platform,
): string | undefined {
  const seen = new Set<string>();
  for (const source of sources) {
    const name = path.basename(source);
    const key = folderKey(name, platform);
    if (seen.has(key)) {
      return name;
    }
    seen.add(key);
  }
  return undefined;
}

export function refusedTarget(
  sources: readonly string[],
  target: string,
  platform: NodeJS.Platform,
  copiedBesideThemselves = false,
): Sentence | undefined {
  const shared = nameShared(sources, platform);
  if (shared !== undefined) {
    return strings.commander.namesAlike(shared);
  }
  const key = (each: string) => folderKey(path.resolve(each), platform);
  if (
    !copiedBesideThemselves &&
    sources.some((source) => key(path.dirname(source)) === key(target))
  ) {
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

const inRealArchive = async (archive: string, inside: string) =>
  path.join(await real(archive), path.relative(archive, inside));

export async function refusedTargetInArchives(
  sources: readonly string[],
  from: string,
  target: string,
  into: string,
  platform: NodeJS.Platform,
): Promise<Sentence | undefined> {
  return (
    refusedTarget(sources, target, platform) ??
    refusedTarget(
      await Promise.all(sources.map((source) => inRealArchive(from, source))),
      await inRealArchive(into, target),
      platform,
    )
  );
}

export async function refusedTargetOnDisk(
  sources: readonly string[],
  target: string,
  platform: NodeJS.Platform,
  copiedBesideThemselves: boolean,
): Promise<Sentence | undefined> {
  return (
    refusedTarget(sources, target, platform, copiedBesideThemselves) ??
    refusedTarget(
      await Promise.all(sources.map(real)),
      await real(target),
      platform,
      copiedBesideThemselves,
    )
  );
}
