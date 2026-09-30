import * as assert from 'node:assert';
import { gitErrorText } from '../git/errorText';

suite('Git error text', () => {
  test("tells what git said, or else the error's message", () => {
    const failed = new Error('Failed to execute git');
    assert.strictEqual(
      gitErrorText(Object.assign(failed, { stderr: '  fatal: bad\n' })),
      'fatal: bad',
    );
    assert.strictEqual(
      gitErrorText(Object.assign(new Error('no output'), { stderr: ' \n' })),
      'no output',
    );
    assert.strictEqual(gitErrorText('plain'), 'plain');
  });
});
