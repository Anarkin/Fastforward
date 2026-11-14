import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { realProgramOf } from './unitSetup';

suite('The programs a unit test may not start', () => {
  test('are the installed git and 7-Zip, by name or by path, started directly or through a shell', () => {
    assert.strictEqual(realProgramOf('git'), 'git');
    assert.strictEqual(realProgramOf('GIT.EXE'), 'git');
    assert.strictEqual(
      realProgramOf(
        path.join(path.sep, 'Program Files', 'Git', 'bin', 'git.exe'),
      ),
      'git',
    );
    assert.strictEqual(realProgramOf('/usr/bin/7zz'), '7-Zip');
    assert.strictEqual(realProgramOf('7z.exe'), '7-Zip');
    assert.strictEqual(realProgramOf('git --version', true), 'git');
    assert.strictEqual(realProgramOf('"git" status', true), 'git');
  });

  test('leave out fakes made in the temporary folder, other programs and commands of other names', () => {
    assert.strictEqual(
      realProgramOf(path.join(os.tmpdir(), 'fake', 'git.exe')),
      undefined,
    );
    assert.strictEqual(realProgramOf(process.execPath), undefined);
    assert.strictEqual(realProgramOf('no-such-git'), undefined);
    assert.strictEqual(realProgramOf('gitk'), undefined);
    assert.strictEqual(realProgramOf('attrib +h file', true), undefined);
    assert.strictEqual(realProgramOf(undefined), undefined);
  });
});
