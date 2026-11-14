import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { withoutCredentials } from '../../../../../../tools/git/main/cli/credentials';

suite('Credentials in URLs', () => {
  test('leaves out the user and password of every URL with a scheme, as git does in what it says, keeping the rest of the text', () => {
    assert.strictEqual(
      withoutCredentials(
        'clone --end-of-options https://x-token:ghp_secret@github.com/org/repo.git app',
      ),
      'clone --end-of-options https://github.com/org/repo.git app',
    );
    assert.strictEqual(
      withoutCredentials(
        'fatal: https://ghp_secret@github.com/a and git+ssh://me:p@ss@host:22/r',
      ),
      'fatal: https://github.com/a and git+ssh://host:22/r',
    );
  });

  test('leaves alone an @ past the host, an address without a scheme, which holds no password, and a path', () => {
    for (const text of [
      'http://host/path@ref',
      'https://host?x=a@b',
      'git@github.com:org/repo.git',
      'file:///C:/a@b',
      'a@b',
    ]) {
      assert.strictEqual(withoutCredentials(text), text);
    }
  });
});
