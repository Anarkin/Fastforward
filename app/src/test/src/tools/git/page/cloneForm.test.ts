import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { formProblem } from '../../../../../tools/git/page/cloneForm';
import { strings } from '../../../../../lib/shared/strings';

suite('Clone form problem', () => {
  test('tells the problem of the URL, then the name, then the one found for this folder and name only', () => {
    const target = { folder: '/code', name: 'app', problem: 'taken' };
    assert.strictEqual(formProblem('', '/code', '..', target), undefined);
    assert.strictEqual(
      formProblem('-x', '/code', '..', target),
      "The URL can't start with -",
    );
    assert.deepStrictEqual(
      formProblem('git@host:app', '/code', '..', target),
      strings.clone.badName('..'),
    );
    assert.strictEqual(
      formProblem('git@host:app', '/code', 'app', target),
      'taken',
    );
    assert.strictEqual(
      formProblem('git@host:app', '/other', 'app', target),
      undefined,
    );
    assert.strictEqual(
      formProblem('git@host:app', '/code', 'app', undefined),
      undefined,
    );
  });
});
