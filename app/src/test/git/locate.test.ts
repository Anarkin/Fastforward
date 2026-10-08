import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findGit, isSupported, onPath, parseVersion } from '../../git/locate';
import { removeFolder, tempFolder } from '../repositories';

suite('Finding git', () => {
  let folder: string;
  const git = process.platform === 'win32' ? 'git.exe' : 'git';

  setup(() => {
    folder = tempFolder('locate');
  });

  teardown(() => removeFolder(folder));

  function executable(name: string): string {
    const file = path.join(folder, name);
    fs.writeFileSync(file, '');
    fs.chmodSync(file, 0o755);
    return file;
  }

  test('finds a command in the first folder of the PATH that has it', () => {
    const inner = path.join(folder, 'inner');
    fs.mkdirSync(inner);
    const found = executable(git);
    executable(path.join('inner', git));
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

  test('finds a command in a quoted folder of the Windows Path, as Windows itself does', () => {
    const found = executable('git.exe');
    assert.strictEqual(
      onPath('git', { Path: `C:\\missing;"${folder}"` }, 'win32'),
      found,
    );
  });

  test('skips a folder named like the command', () => {
    fs.mkdirSync(path.join(folder, git));
    assert.strictEqual(
      onPath('git', { PATH: folder }, process.platform),
      undefined,
    );
  });

  test('skips a file it cannot run', function () {
    if (process.platform === 'win32') {
      this.skip();
    }
    fs.writeFileSync(path.join(folder, 'git'), '', { mode: 0o644 });
    assert.strictEqual(onPath('git', { PATH: folder }, 'linux'), undefined);
  });

  test('skips a .cmd or .bat wrapper on Windows, which it cannot run without a shell', () => {
    const wrappers = path.join(folder, 'wrappers');
    const installed = path.join(folder, 'installed');
    fs.mkdirSync(wrappers);
    fs.mkdirSync(installed);
    fs.writeFileSync(path.join(wrappers, 'git.cmd'), '');
    fs.writeFileSync(path.join(wrappers, 'git.bat'), '');
    fs.writeFileSync(path.join(installed, 'git.exe'), '');
    assert.strictEqual(
      onPath(
        'git',
        { PATH: `${wrappers};${installed}`, PATHEXT: '.COM;.EXE;.BAT;.CMD' },
        'win32',
      ),
      path.join(installed, 'git.exe'),
    );
  });

  test('finds nothing without a PATH', () => {
    assert.strictEqual(onPath('git', {}, 'linux'), undefined);
  });

  test('finds git on the PATH only in a version it supports, telling one too old from one whose version it cannot read', async () => {
    const found = executable(git);
    const search = (output: string) =>
      findGit({ PATH: folder }, process.platform, async (gitPath) => {
        assert.strictEqual(gitPath, found);
        return output;
      });
    assert.deepStrictEqual(await search('git version 2.52.0\n'), {
      kind: 'found',
      path: found,
      version: '2.52.0',
    });
    assert.deepStrictEqual(await search('git version 2.51.2\n'), {
      kind: 'tooOld',
      path: found,
      version: '2.51.2',
    });
    assert.deepStrictEqual(await search('command not found'), {
      kind: 'missing',
    });
  });

  test('finds no git, instead of failing, in a git on the PATH that is no program, which Windows refuses to start at all', async () => {
    executable(git);
    assert.deepStrictEqual(await findGit({ PATH: folder }), {
      kind: 'missing',
    });
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
