import { listIndex, listTree, uniquePaths } from './fileLists';
import type { WorkingTree } from './workingTree';
import type { Context } from './tabContext';
import { shownCommit } from '../../../lib/shared/comparisons';

export class TreePaths {
  async inWorkingTree(context: Context, file: string): Promise<boolean> {
    const { tab } = context;
    if (
      [tab.changedFiles, tab.stagedFiles].some((changes) =>
        [...changes.values()].some(
          (change) => change.path === file || change.oldPath === file,
        ),
      ) ||
      tab.workingTree?.untracked.includes(file)
    ) {
      return true;
    }
    tab.indexPaths ??= await listIndex(context.gitPath, context.root);
    return tab.indexPaths.includes(file);
  }

  async sendTree(
    context: Context,
    hash: string,
    refreshed?: WorkingTree,
  ): Promise<void> {
    const { gitPath, root } = context;
    const commit = shownCommit(hash);
    let paths: string[];
    if (refreshed === undefined || commit !== undefined) {
      paths = await listTree(gitPath, root, commit);
    } else {
      context.tab.indexPaths ??= await listIndex(gitPath, root);
      paths = uniquePaths(refreshed.untracked, context.tab.indexPaths);
    }
    if (context.tab.hash !== hash) {
      return;
    }
    const shown = context.tab.shown.tree;
    const unchanged =
      refreshed !== undefined &&
      shown?.hash === hash &&
      shown.paths.length === paths.length &&
      shown.paths.every((file, index) => file === paths[index]);
    if (!unchanged) {
      context.post({ type: 'tree', hash, paths });
    }
  }
}
