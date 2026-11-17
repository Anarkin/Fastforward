import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { passwordQuestion } from '../../../../../tools/commander/page/passwordAsking';

suite('Commander asking for a password', () => {
  test('names the archive by its whole path on a line of its own, with no sentence or label, as the title asks for the password', () => {
    assert.deepStrictEqual(
      passwordQuestion({ name: 'C:\\Drive\\p1.zip', wrong: false }),
      {
        title: 'Password',
        lines: [{ name: 'C:\\Drive\\p1.zip', path: 'file' }],
      },
    );
  });

  test('says when the password typed was wrong', () => {
    assert.deepStrictEqual(
      passwordQuestion({ name: '/home/me/p1.zip', wrong: true }),
      {
        title: 'Password',
        message: 'The password is wrong. Type it again.',
        lines: [{ name: '/home/me/p1.zip', path: 'file' }],
      },
    );
  });
});
