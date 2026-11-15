import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GitToWebviewOf } from '../../../../../tools/git/shared/protocol';
import { type OpenView, shownTabs } from '../../../../helpers/harness';
import {
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';

export interface WorktreeRepositories {
  readonly folder: string;
  readonly repository: TempRepository;
  readonly feature: string;
  readonly review: string;
  readonly other: string;
  readonly reviewHead: string;
}

export async function worktreeRepositories(): Promise<WorktreeRepositories> {
  const folder = tempFolder('worktree-view');
  const repository = await tempRepository(path.join(folder, 'app'));
  await repository.commit('a');
  await repository.commit('b');
  const feature = path.join(folder, 'app.worktrees', 'feature');
  const review = path.join(folder, 'app.worktrees', 'review');
  const gone = path.join(folder, 'app.worktrees', 'gone');
  await repository.git('worktree', 'add', '-q', '-b', 'feature', feature);
  await repository.git('-C', feature, 'commit', '--allow-empty', '-m', 'f');
  await repository.git('worktree', 'add', '-q', '--detach', review, 'HEAD~1');
  await repository.git('worktree', 'add', '-q', '-b', 'gone', gone);
  fs.rmSync(gone, { recursive: true, force: true });
  const [reviewHead] = await repository.resolve('main~1');
  const second = await tempRepository(path.join(folder, 'other'));
  await second.commit('other');
  return {
    folder,
    repository,
    feature,
    review,
    other: second.root,
    reviewHead,
  };
}

export function sameRealFolder(a: string | undefined, b: string): boolean {
  return (
    a !== undefined &&
    fs.existsSync(a) &&
    fs.realpathSync.native(a) === fs.realpathSync.native(b)
  );
}

export function worktreesOf(
  view: OpenView,
): NonNullable<GitToWebviewOf<'worktrees'>['worktrees']> {
  return shownTabs(view.page)?.worktrees ?? [];
}

export function worktreeRoot(view: OpenView, root: string): string {
  const found = worktreesOf(view).find((worktree) =>
    sameRealFolder(worktree.root, root),
  );
  assert.ok(found, root);
  return found.root;
}
