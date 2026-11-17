import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { wellFormed } from '../../../../../tools/git/main/messageChecks';

const viewing = (more: object) =>
  wellFormed({
    type: 'viewFile',
    root: '/repo',
    path: 'a.ts',
    ...more,
  });

suite('Git message checks', () => {
  test('views a file from the working tree, a blob or a version it takes, and nothing else', () => {
    assert.deepStrictEqual(
      [
        {},
        { blob: 'b'.repeat(40) },
        { rev: 'HEAD' },
        { rev: 'index' },
        { rev: `${'c'.repeat(40)}^` },
      ].map(viewing),
      [true, true, true, true, true],
    );
    assert.deepStrictEqual(
      [{ rev: 'main' }, { rev: '--output=x' }, { rev: 5 }].map(viewing),
      [false, false, false],
    );
  });
});
