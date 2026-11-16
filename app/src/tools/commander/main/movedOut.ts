import * as fs from 'node:fs';
import * as path from 'node:path';
import { folderKey } from '../shared/paths';
import type { ArchiveBranch } from './archiveTree';

export async function presentIn(
  folder: string,
  platform: NodeJS.Platform,
): Promise<ReadonlySet<string>> {
  const found = await fs.promises.readdir(folder, {
    recursive: true,
    encoding: 'utf8',
  });
  return new Set(found.map((each) => folderKey(each, platform)));
}

function branchesOf(roots: readonly ArchiveBranch[]): ArchiveBranch[] {
  return roots.flatMap((root) => [root, ...branchesOf(root.children)]);
}

export function movedOut(
  roots: readonly ArchiveBranch[],
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
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
    counts.get(keyOf(branch)) === 1 && before.has(keyOf(branch));
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
