import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { isSupported, onPath, parseVersion } from '../git/locate';

suite('Finding git', () => {
  let folder: string;

  setup(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-locate-'));
  });

  teardown(() => fs.rmSync(folder, { recursive: true, force: true }));

  function executable(name: string): string {
    const file = path.join(folder, name);
    fs.writeFileSync(file, '');
    fs.chmodSync(file, 0o755);
    return file;
  }

  test('finds a command in the first folder of the PATH that has it', () => {
    const inner = path.join(folder, 'inner');
    fs.mkdirSync(inner);
    const name = process.platform === 'win32' ? 'git.exe' : 'git';
    const found = executable(name);
    fs.writeFileSync(path.join(inner, name), '');
    assert.strictEqual(
      onPath(
        'git',
        { PATH: [folder, inner].join(path.delimiter) },
        process.platform,
      ),
      found,
    );
  });

  test('finds a command by its Windows extensions, whatever the case of Path', () => {
    const found = executable('git.exe');
    assert.strictEqual(
      onPath('git', { Path: `${folder};`, PATHEXT: '.COM;.EXE' }, 'win32'),
      found,
    );
  });

  test('skips folders and files it cannot run', function () {
    if (process.platform === 'win32') {
      this.skip();
    }
    fs.mkdirSync(path.join(folder, 'git'));
    assert.strictEqual(onPath('git', { PATH: folder }, 'linux'), undefined);
    fs.rmdirSync(path.join(folder, 'git'));
    fs.writeFileSync(path.join(folder, 'git'), '', { mode: 0o644 });
    assert.strictEqual(onPath('git', { PATH: folder }, 'linux'), undefined);
  });

  test('finds nothing without a PATH', () => {
    assert.strictEqual(onPath('git', {}, 'linux'), undefined);
  });

  test('reads the version of git, Windows builds included', () => {
    assert.strictEqual(parseVersion('git version 2.55.0\n'), '2.55.0');
    assert.strictEqual(
      parseVersion('git version 2.55.0.windows.1\n'),
      '2.55.0',
    );
    assert.strictEqual(
      parseVersion('git version 2.39.5 (Apple Git-154)\n'),
      '2.39.5',
    );
    assert.strictEqual(parseVersion('command not found'), undefined);
  });

  test('supports git 2.52 and later', () => {
    assert.strictEqual(isSupported('2.52.0'), true);
    assert.strictEqual(isSupported('2.55.0'), true);
    assert.strictEqual(isSupported('3.0'), true);
    assert.strictEqual(isSupported('2.51.2'), false);
    assert.strictEqual(isSupported('1.99.0'), false);
  });
});
