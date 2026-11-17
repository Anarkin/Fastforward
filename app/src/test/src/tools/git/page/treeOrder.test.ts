import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  changesTree,
  changesTreeRows,
} from '../../../../../tools/git/page/changesRows';
import { inTreeOrder } from '../../../../../tools/git/page/treeOrder';
import {
  changesShown,
  emptyTabView,
  reduceTabView,
  type TabView,
} from '../../../../../tools/git/page/shownTab';
import {
  workingTreeHash,
  type GitToWebviewOf,
} from '../../../../../tools/git/shared/protocol';
import { fileChange } from '../../../../helpers/gitValues';

const changes = (...paths: string[]) => paths.map((path) => fileChange(path));

const columnPaths = (paths: readonly string[]) =>
  changesTreeRows(changesTree(changes(...paths)), new Set()).flatMap((row) =>
    row.kind === 'file' ? [row.path] : [],
  );

const listed = (message: GitToWebviewOf<'files'>) =>
  reduceTabView(
    reduceTabView(emptyTabView, { type: 'showCommit', hash: message.hash }),
    message,
  );

const shownPaths = (view: TabView) =>
  changesShown(view).map((file) => file.path);

suite('Tree order', () => {
  test('lists the files of a commit, and of each side of the working tree, in the order the files column shows them rather than in the order git gives them, so the diff runs top to bottom as the column does', () => {
    const commit = listed({
      type: 'files',
      hash: 'a',
      files: changes(
        'README.md',
        'Zeta.ts',
        'app/.oxlintrc.json',
        'app/src/lib/a.ts',
        'b.ts',
      ),
    });
    assert.deepStrictEqual(shownPaths(commit), [
      'app/src/lib/a.ts',
      'app/.oxlintrc.json',
      'b.ts',
      'README.md',
      'Zeta.ts',
    ]);
    const workingTree = listed({
      type: 'files',
      hash: workingTreeHash,
      files: changes('src/b.ts', 'a.ts'),
      staged: changes('README.md', 'lib/c.ts'),
      all: changes('README.md', 'lib/c.ts', 'src/b.ts', 'a.ts'),
    });
    assert.deepStrictEqual(
      ([undefined, 'staged', 'unstaged'] as const).map((area) =>
        shownPaths({ ...workingTree, area }),
      ),
      [
        ['lib/c.ts', 'src/b.ts', 'a.ts', 'README.md'],
        ['lib/c.ts', 'README.md'],
        ['src/b.ts', 'a.ts'],
      ],
    );
  });

  test('orders the changes as the files column lists them, a single folder merged into its parent, a file beside a folder of its name and names differing in case alone', () => {
    const paths = [
      'Makefile',
      'README.md',
      'app/.oxlintrc.json',
      'app/package.json',
      'app/src/lib/b.ts',
      'app/src/lib/a.ts',
      'app/src-old/x.ts',
      'docs',
      'docs/a.md',
      'readme.txt',
      'Ä.txt',
      'z/y/x/deep.ts',
    ];
    const ordered = inTreeOrder(changes(...paths)).map((file) => file.path);
    assert.deepStrictEqual(ordered, columnPaths(paths));
    assert.notDeepStrictEqual(ordered, paths);
  });

  test('keeps every change of a path git names twice, as an unmerged one, together in the order git gave them', () => {
    const ordered = inTreeOrder([
      fileChange('b.ts', { status: 'U' }),
      fileChange('a.ts'),
      fileChange('b.ts'),
    ]);
    assert.deepStrictEqual(
      ordered.map((file) => [file.path, file.status]),
      [
        ['a.ts', 'M'],
        ['b.ts', 'U'],
        ['b.ts', 'M'],
      ],
    );
  });
});
