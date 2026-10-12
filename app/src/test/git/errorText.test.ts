import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { gitErrorText } from '../../git/errorText';

suite('Git error text', () => {
  test("prefers git's trimmed stderr", () => {
    const error = Object.assign(
      new Error('git log failed: fatal: bad revision\n'),
      { stderr: '  fatal: bad revision\n' },
    );
    assert.strictEqual(gitErrorText(error), 'fatal: bad revision');
  });

  test("leaves out git's hints, which explain the commands to type rather than what went wrong", () => {
    const error = Object.assign(new Error('git push failed'), {
      stderr: [
        'To /remote',
        ' ! [rejected]        main -> main (fetch first)',
        "error: failed to push some refs to '/remote'",
        'hint: Updates were rejected because the remote contains work that you do not',
        'hint: have locally.',
      ].join('\n'),
    });
    assert.strictEqual(
      gitErrorText(error),
      [
        'To /remote',
        ' ! [rejected]        main -> main (fetch first)',
        "error: failed to push some refs to '/remote'",
      ].join('\n'),
    );
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
