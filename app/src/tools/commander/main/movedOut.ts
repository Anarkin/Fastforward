import { fs } from '../../../lib/main/files';
import * as path from 'node:path';
import { folderKey } from '../shared/paths';
import type { ArchiveBranch } from './archiveTree';

export type Present = ReadonlyMap<string, number | undefined>;

export async function presentIn(
  folder: string,
  platform: NodeJS.Platform,
): Promise<Present> {
  const found = await fs.promises.readdir(folder, {
    recursive: true,
    encoding: 'utf8',
  });
  const present = new Map<string, number | undefined>();
  for (const each of found) {
    const stats = await fs.promises.lstat(path.join(folder, each));
    present.set(
      folderKey(each, platform),
      stats.isFile() ? stats.size : undefined,
    );
  }
  return present;
}

function branchesOf(roots: readonly ArchiveBranch[]): ArchiveBranch[] {
  return roots.flatMap((root) => [root, ...branchesOf(root.children)]);
}

export function movedOut(
  roots: readonly ArchiveBranch[],
  before: Present,
  after: { has: (key: string) => boolean },
  withoutFolders: boolean,
  platform: NodeJS.Platform,
): { readonly paths: readonly string[]; readonly unmatched: number } {
  const keyOf = ({ parts }: ArchiveBranch) =>
    folderKey(
      withoutFolders ? (parts.at(-1) ?? '') : parts.join(path.sep),
      platform,
    );
  const all = branchesOf(roots);
  const counts = new Map<string, number>();
  for (const branch of all) {
    const key = keyOf(branch);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const matched = (branch: ArchiveBranch) =>
    counts.get(keyOf(branch)) === 1 &&
    before.has(keyOf(branch)) &&
    (branch.folder ||
      branch.size === undefined ||
      before.get(keyOf(branch)) === branch.size);
  const whole = (branch: ArchiveBranch): boolean =>
    matched(branch) && branch.children.every(whole);
  const paths: string[] = [];
  const visit = (branch: ArchiveBranch) => {
    if (whole(branch) && !after.has(keyOf(branch))) {
      paths.push(branch.path);
      return;
    }
    for (const child of branch.children) {
      visit(child);
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return {
    paths,
    unmatched: all.filter((branch) => !branch.folder && !matched(branch))
      .length,
  };
}
