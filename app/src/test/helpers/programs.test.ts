import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { programExpectedOf, realProgramOf, suffixOf } from './programs';

suite('The real programs a test may start', () => {
  test('are the installed git, 7-Zip, the shells and Electron, by name or by path, started directly or through a shell', () => {
    assert.strictEqual(realProgramOf('git'), 'the installed git');
    assert.strictEqual(realProgramOf('GIT.EXE'), 'the installed git');
    assert.strictEqual(
      realProgramOf(
        path.join(path.sep, 'Program Files', 'Git', 'bin', 'git.exe'),
      ),
      'the installed git',
    );
    assert.strictEqual(realProgramOf('/usr/bin/7zz'), '7-Zip');
    assert.strictEqual(realProgramOf('7z.exe'), '7-Zip');
    assert.strictEqual(realProgramOf('/bin/bash'), 'a shell');
    assert.strictEqual(realProgramOf('pwsh.exe'), 'a shell');
    assert.strictEqual(
      realProgramOf('/app/Electron.app/Contents/MacOS/Electron'),
      'Electron',
    );
    assert.strictEqual(
      realProgramOf('git --version', true),
      'the installed git',
    );
    assert.strictEqual(
      realProgramOf('"git" status', true),
      'the installed git',
    );
    assert.strictEqual(
      realProgramOf(
        '"C:\\app\\node_modules\\electron\\dist\\electron.exe" "-r" "C:\\app\\loader.js"',
      ),
      'Electron',
    );
  });

  test('leave out fakes made in the temporary folder, other programs and commands of other names', () => {
    assert.strictEqual(
      realProgramOf(path.join(os.tmpdir(), 'fake', 'git.exe')),
      undefined,
    );
    assert.strictEqual(realProgramOf(process.execPath), undefined);
    assert.strictEqual(realProgramOf('no-such-git'), undefined);
    assert.strictEqual(realProgramOf('gitk'), undefined);
    assert.strictEqual(realProgramOf('cmd.exe'), undefined);
    assert.strictEqual(realProgramOf('attrib +h file', true), undefined);
    assert.strictEqual(realProgramOf(undefined), undefined);
  });

  test('are told by the suffix of the name of the test file, none for a unit test, and any for the tests of the build', () => {
    assert.strictEqual(suffixOf('/app/src/test/a/run.git.test.ts'), 'git');
    assert.strictEqual(suffixOf('/app/src/test/a/run.test.ts'), undefined);
    assert.strictEqual(
      programExpectedOf('/app/src/test/a/run.git.test.ts'),
      'the installed git',
    );
    assert.strictEqual(
      programExpectedOf('/app/src/test/e2e/app.perf.test.ts'),
      'Electron',
    );
    assert.strictEqual(
      programExpectedOf('/app/src/test/a/run.test.tsx'),
      'none',
    );
    assert.strictEqual(
      programExpectedOf('C:\\app\\src\\test\\build\\installer.test.ts'),
      'any',
    );
  });
});
