import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { comparisonOf } from '../../../../../lib/shared/comparisons';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import {
  filesTitle,
  noChangesText,
} from '../../../../../tools/git/page/filesTitles';

suite('Files column', () => {
  test('titles itself with the commit shown or the two compared, as the history names them, as Files while none is, and with nothing for the uncommitted changes, which their row atop the history already names', () => {
    const hash = '0123456789abcdef0123456789abcdef01234567';
    assert.strictEqual(filesTitle(undefined), 'Files');
    assert.strictEqual(filesTitle(hash), '0123456');
    assert.strictEqual(filesTitle(workingTreeHash), '');
    assert.strictEqual(
      filesTitle(comparisonOf(hash, workingTreeHash)),
      '0123456 → uncommitted',
    );
  });

  test('says a commit changed nothing, or that the two compared have the same files', () => {
    const hash = '0123456789abcdef0123456789abcdef01234567';
    assert.strictEqual(noChangesText(undefined, undefined), undefined);
    assert.strictEqual(noChangesText(hash, undefined), 'No changes');
    assert.strictEqual(
      noChangesText(comparisonOf(hash, workingTreeHash), undefined),
      'No differences, both have the same files',
    );
  });

  test('says nothing changed only while no error is shown, as files that could not be listed are none', () => {
    const hash = '0123456789abcdef0123456789abcdef01234567';
    const error = 'fatal: unable to read tree 1234abcd';
    assert.strictEqual(noChangesText(hash, error), undefined);
    assert.strictEqual(
      noChangesText(comparisonOf(hash, workingTreeHash), error),
      undefined,
    );
  });
});
