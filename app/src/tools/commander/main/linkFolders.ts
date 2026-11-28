import { fs } from '../../../lib/main/files';
import * as path from 'node:path';

export type LinkFolder = (
  item: string,
  listedAsLink?: boolean,
) => Promise<boolean>;

async function listedAsLinkIn(item: string): Promise<boolean> {
  const name = path.basename(item);
  const entries = await fs.promises
    .readdir(path.dirname(item), { withFileTypes: true })
    .catch(() => []);
  return (
    entries.find((entry) => entry.name === name)?.isSymbolicLink() ?? false
  );
}

const realOf = (item: string) =>
  fs.promises.realpath(item).then(
    (real) => real.toLowerCase(),
    () => undefined,
  );

async function windowsLinkFolder(
  item: string,
  listedAsLink?: boolean,
): Promise<boolean> {
  if (!(listedAsLink ?? (await listedAsLinkIn(item)))) {
    return false;
  }
  const [real, realParent] = await Promise.all([
    realOf(item),
    realOf(path.dirname(item)),
  ]);
  return (
    real === undefined ||
    realParent === undefined ||
    real !== path.join(realParent, path.basename(item)).toLowerCase()
  );
}

export function linkFolderTest(
  platform: NodeJS.Platform = process.platform,
): LinkFolder {
  return platform === 'win32' ? windowsLinkFolder : async () => false;
}
