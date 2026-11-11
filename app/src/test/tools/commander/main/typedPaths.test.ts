import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  typedPath,
  type PathTyping,
} from '../../../../tools/commander/main/typedPaths';

const windowsVariables: Readonly<Record<string, string>> = {
  APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
  'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
  SYSTEMDRIVE: 'C:',
};

const windows: PathTyping = {
  paths: path.win32,
  platform: 'win32',
  variable: (name) => windowsVariables[name.toUpperCase()],
  home: 'C:\\Users\\me',
  knownFolder: (name) =>
    Promise.resolve(
      name.toLowerCase() === 'shell:downloads'
        ? 'C:\\Users\\me\\Downloads'
        : undefined,
    ),
};

const linuxVariables: Readonly<Record<string, string>> = {
  HOME: '/home/me',
  XDG_CONFIG_HOME: '/home/me/.config',
};

const linux: PathTyping = {
  paths: path.posix,
  platform: 'linux',
  variable: (name) => linuxVariables[name],
  home: '/home/me',
  knownFolder: () => Promise.reject(new Error('no known folders')),
};

const typedOn = (system: PathTyping, from: string, typed: readonly string[]) =>
  Promise.all(typed.map((each) => typedPath(each, from, system)));

suite('Commander typed paths', () => {
  test('goes to a whole path as typed, a relative one from the folder of the side, a drive alone to its root, leaving out the spaces around it and the quotes Copy as path puts around it, and nowhere for nothing typed', async () => {
    assert.deepStrictEqual(
      await typedOn(windows, 'C:\\Code', [
        'D:\\Work\\',
        'd:/work/src',
        '..\\Tools',
        'src',
        'D:',
        '  "C:\\Program Files"  ',
        '\\\\server\\share\\docs',
        '\\Windows',
        '""',
        '   ',
      ]),
      [
        'D:\\Work',
        'd:\\work\\src',
        'C:\\Tools',
        'C:\\Code\\src',
        'D:\\',
        'C:\\Program Files',
        '\\\\server\\share\\docs',
        'C:\\Windows',
        undefined,
        undefined,
      ],
    );
    assert.deepStrictEqual(
      await typedOn(linux, '/home/adam', [
        '/srv/',
        '../tmp',
        'src',
        '"/home/adam/My Files"',
        'D:',
      ]),
      [
        '/srv',
        '/home/tmp',
        '/home/adam/src',
        '/home/adam/My Files',
        '/home/adam/D:',
      ],
    );
  });

  test('puts the value of an environment variable in place of its name between percent signs on Windows, whatever its case, leaving a name it has no value for as typed', async () => {
    assert.deepStrictEqual(
      await typedOn(windows, 'C:\\Code', [
        '%APPDATA%',
        '%appdata%\\Code\\User',
        '"%ProgramFiles(x86)%\\Steam"',
        '%SystemDrive%',
        '%NOWHERE%\\x',
        '100%',
      ]),
      [
        'C:\\Users\\me\\AppData\\Roaming',
        'C:\\Users\\me\\AppData\\Roaming\\Code\\User',
        'C:\\Program Files (x86)\\Steam',
        'C:\\',
        'C:\\Code\\%NOWHERE%\\x',
        'C:\\Code\\100%',
      ],
    );
  });

  test('puts the value of an environment variable in place of its name after a dollar sign on macOS and Linux, braced or not, leaving a name it has no value for as typed, and percent signs as they are', async () => {
    assert.deepStrictEqual(
      await typedOn(linux, '/srv', [
        '$HOME',
        '$HOME/src',
        '${XDG_CONFIG_HOME}/fish',
        '$NOWHERE/x',
        '%HOME%',
      ]),
      [
        '/home/me',
        '/home/me/src',
        '/home/me/.config/fish',
        '/srv/$NOWHERE/x',
        '/srv/%HOME%',
      ],
    );
  });

  test('takes a tilde alone or before a separator for the home folder, and as a name anywhere else', async () => {
    assert.deepStrictEqual(
      await typedOn(windows, 'C:\\Code', [
        '~',
        '~\\Downloads',
        '~/src',
        'a~b',
        '~me',
      ]),
      [
        'C:\\Users\\me',
        'C:\\Users\\me\\Downloads',
        'C:\\Users\\me\\src',
        'C:\\Code\\a~b',
        'C:\\Code\\~me',
      ],
    );
    assert.deepStrictEqual(
      await typedOn(linux, '/srv', ['~', '~/src', 'a~b']),
      ['/home/me', '/home/me/src', '/srv/a~b'],
    );
  });

  test('goes to the folder a shell: name stands for on Windows, whatever its case, and on into a folder under it, leaving a name of no folder on disk as typed, and asks nothing on macOS or Linux', async () => {
    assert.deepStrictEqual(
      await typedOn(windows, 'C:\\Code', [
        'shell:downloads',
        'Shell:Downloads\\sub',
        'shell:AppsFolder',
      ]),
      [
        'C:\\Users\\me\\Downloads',
        'C:\\Users\\me\\Downloads\\sub',
        'C:\\Code\\shell:AppsFolder',
      ],
    );
    assert.deepStrictEqual(await typedOn(linux, '/srv', ['shell:downloads']), [
      '/srv/shell:downloads',
    ]);
  });
});
