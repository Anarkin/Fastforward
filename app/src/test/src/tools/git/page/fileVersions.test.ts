import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { fileVersions } from '../../../../../tools/git/page/fileVersions';
import { workingTreeHash } from '../../../../../lib/shared/changes';
import { comparisonOf } from '../../../../../lib/shared/comparisons';
import { fileChange } from '../../../../helpers/gitValues';

const a = 'a'.repeat(40);
const b = 'b'.repeat(40);

const changes = [
  fileChange('src/changed.ts'),
  fileChange('src/added.ts', { status: 'A' }),
  fileChange('src/gone.ts', { status: 'D' }),
  fileChange('src/new.ts', { status: 'R', oldPath: 'lib/old.ts' }),
];

const shown = [
  '/repo/src/changed.ts',
  '/repo/src/added.ts',
  '/repo/src/gone.ts',
  '/repo/src/new.ts',
  '/repo/lib/old.ts',
  '/repo/docs/readme.md',
  '/repo',
  '/elsewhere/x.ts',
];

const versionsOf = (hash: string, area?: 'staged' | 'unstaged') => {
  const versionOf = fileVersions('/repo', hash, area, changes);
  return Object.fromEntries(
    shown.flatMap((path) => {
      const at = versionOf(path);
      return at === undefined ? [] : [[path, at.rev]];
    }),
  );
};

suite('The versions of the files git shows', () => {
  test('shows the files of a commit as the commit has them, those it did not change too, and those it deleted or renamed away from as its parent had them, nothing outside the repository', () => {
    assert.deepStrictEqual(versionsOf(a), {
      '/repo/src/changed.ts': a,
      '/repo/src/added.ts': a,
      '/repo/src/gone.ts': `${a}^`,
      '/repo/src/new.ts': a,
      '/repo/lib/old.ts': `${a}^`,
      '/repo/docs/readme.md': a,
    });
  });

  test('shows the files of a comparison as each side has them', () => {
    assert.deepStrictEqual(versionsOf(comparisonOf(a, b)), {
      '/repo/src/changed.ts': b,
      '/repo/src/added.ts': b,
      '/repo/src/gone.ts': a,
      '/repo/src/new.ts': b,
      '/repo/lib/old.ts': a,
      '/repo/docs/readme.md': b,
    });
  });

  test('leaves the files of the working tree to the disk, naming only those gone from it, as HEAD or the index has them, and the staged ones as the index has them', () => {
    const gone = { '/repo/src/gone.ts': 'HEAD', '/repo/lib/old.ts': 'HEAD' };
    assert.deepStrictEqual(versionsOf(workingTreeHash), gone);
    assert.deepStrictEqual(versionsOf(workingTreeHash, 'unstaged'), {
      '/repo/src/gone.ts': 'index',
      '/repo/lib/old.ts': 'index',
    });
    assert.deepStrictEqual(versionsOf(workingTreeHash, 'staged'), {
      '/repo/src/changed.ts': 'index',
      '/repo/src/added.ts': 'index',
      ...gone,
      '/repo/src/new.ts': 'index',
      '/repo/docs/readme.md': 'index',
    });
    assert.deepStrictEqual(versionsOf(comparisonOf(a, workingTreeHash)), {
      '/repo/src/gone.ts': a,
      '/repo/lib/old.ts': a,
    });
    assert.deepStrictEqual(versionsOf(comparisonOf(workingTreeHash, a)), {
      '/repo/src/changed.ts': a,
      '/repo/src/added.ts': a,
      '/repo/src/new.ts': a,
      '/repo/docs/readme.md': a,
    });
  });

  test('names each file by its path in the repository, to view it at its version, and its whole path in the separators of the folder of the worktree', () => {
    const versionOf = fileVersions('C:\\repo', a, undefined, changes);
    assert.deepStrictEqual(
      [
        'C:\\repo\\src\\changed.ts',
        'C:\\repo\\lib\\old.ts',
        'C:\\repo\\docs\\readme.md',
        'C:\\repository\\x.ts',
      ].map(versionOf),
      [
        { path: 'src/changed.ts', rev: a },
        { path: 'lib/old.ts', rev: `${a}^` },
        { path: 'docs/readme.md', rev: a },
        undefined,
      ],
    );
  });
});
