import * as assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, suite, test } from 'vitest';
import { foldersOf } from '../../main/commandLine';
import {
  addExplorerMenu,
  explorerMenuOf,
  type RegistryValue,
} from '../../main/explorerMenu';
import { strings } from '../../shared/strings';

const installed = 'C:\\Users\\me\\AppData\\Local\\Programs\\fastforward';
const executable = `${installed}\\Fastforward.exe`;
const exists = (file: string) =>
  file === `${installed}\\Uninstall Fastforward.exe`;

function menuOf(app: string): readonly RegistryValue[] {
  const menu = explorerMenuOf('win32', app, () => true);
  assert.ok(menu);
  return menu;
}

suite('Explorer menu', () => {
  test('is added only by the app installed on Windows, not when run from the source or the unpacked build, as only the uninstaller removes it', () => {
    assert.strictEqual(explorerMenuOf('linux', executable, exists), undefined);
    assert.strictEqual(explorerMenuOf('darwin', executable, exists), undefined);
    assert.strictEqual(
      explorerMenuOf(
        'win32',
        'C:\\Code\\Fastforward\\app\\release\\win-unpacked\\Fastforward.exe',
        exists,
      ),
      undefined,
    );
    assert.notStrictEqual(
      explorerMenuOf('win32', executable, exists),
      undefined,
    );
  });

  test('opens the folder right-clicked, or the one whose empty space was, in the app, showing its icon and a label from the strings, which is why the app adds it rather than the installer', () => {
    const folder = 'Software\\Classes\\Directory\\shell\\Fastforward';
    const inside =
      'Software\\Classes\\Directory\\Background\\shell\\Fastforward';
    const command = `"${executable}" -- "%V\\."`;
    assert.deepStrictEqual(explorerMenuOf('win32', executable, exists), [
      { key: folder, name: undefined, data: strings.app.explorerMenuEntry },
      { key: folder, name: 'Icon', data: executable },
      { key: `${folder}\\command`, name: undefined, data: command },
      { key: inside, name: undefined, data: strings.app.explorerMenuEntry },
      { key: inside, name: 'Icon', data: executable },
      { key: `${inside}\\command`, name: undefined, data: command },
    ]);
  });

  test.skipIf(process.platform !== 'win32')(
    'hands the app the folder whole, a drive root included, as the backslash ending one would escape the closing quote',
    () => {
      const app = `"${process.execPath}"`;
      const commands = menuOf(process.execPath)
        .filter((value) => value.key.endsWith('\\command'))
        .map((value) => value.data);
      assert.strictEqual(commands.length, 2);
      for (const command of commands) {
        assert.ok(command.startsWith(app), command);
        for (const folder of [
          'C:\\',
          'D:\\My repo',
          '\\\\server\\share\\repo',
        ]) {
          const ran = spawnSync(
            process.execPath,
            [
              `-e "process.stdout.write(JSON.stringify(process.argv))"${command
                .slice(app.length)
                .replace('%V', folder)}`,
            ],
            { argv0: app, windowsVerbatimArguments: true, encoding: 'utf8' },
          );
          assert.strictEqual(ran.status, 0, ran.stderr);
          const argv: unknown = JSON.parse(ran.stdout);
          assert.ok(
            Array.isArray(argv) &&
              argv.every((arg): arg is string => typeof arg === 'string'),
          );
          assert.deepStrictEqual(foldersOf(argv, false, 'E:\\'), [folder]);
        }
      }
    },
  );
});

suite.skipIf(process.platform !== 'win32')(
  'Explorer menu in the registry',
  { timeout: 30_000 },
  () => {
    const root = `HKCU\\Software\\Fastforward Tests ${randomUUID()}`;

    afterAll(() => {
      spawnSync('reg.exe', ['delete', root, '/f']);
    });

    function read(value: RegistryValue): string | undefined {
      const ran = spawnSync(
        'reg.exe',
        [
          'query',
          `${root}\\${value.key}`,
          ...(value.name === undefined ? ['/ve'] : ['/v', value.name]),
        ],
        { encoding: 'utf8' },
      );
      assert.strictEqual(ran.status, 0, ran.stderr);
      return / {4}REG_SZ {4}(.*?)\r?$/m.exec(ran.stdout)?.[1];
    }

    test('writes the entries as they are, keeping the quotes and %V of the command, over those of another copy of the app', async () => {
      await addExplorerMenu(menuOf('C:\\Old place\\Fastforward.exe'), root);
      const menu = menuOf(
        "C:\\Users\\Jo O'Neil\\AppData\\Local\\Programs\\fastforward\\Fastforward.exe",
      );
      await addExplorerMenu(menu, root);
      await addExplorerMenu(menu, root);
      for (const value of menu) {
        assert.strictEqual(read(value), value.data);
      }
    });
  },
);
