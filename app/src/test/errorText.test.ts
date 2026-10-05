import * as assert from 'node:assert';
import { gitErrorText } from '../git/errorText';

suite('Git error text', () => {
  test("prefers git's trimmed stderr", () => {
    const error = Object.assign(
      new Error('git log failed: fatal: bad revision\n'),
      { stderr: '  fatal: bad revision\n' },
    );
    assert.strictEqual(gitErrorText(error), 'fatal: bad revision');
  });

  test('falls back to the message when stderr is blank', () => {
    const error = Object.assign(new Error('git log failed: spawn ENOENT'), {
      stderr: ' \n',
    });
    assert.strictEqual(gitErrorText(error), 'git log failed: spawn ENOENT');
  });

  test('turns anything else thrown into a string', () => {
    assert.strictEqual(gitErrorText('boom'), 'boom');
    assert.strictEqual(gitErrorText(42), '42');
  });
});
