import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  partLooksOf,
  type LookingFiles,
} from '../../../../../tools/commander/main/partLooks';

function filesOf(
  entries: Readonly<Record<string, { folder?: true; mode?: number }>>,
  hidden: readonly string[] = [],
): LookingFiles & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    hidden: (file) => Promise.resolve(hidden.includes(file)),
    stat: (file) => {
      asked.push(file);
      const entry = entries[file];
      return Promise.resolve(
        entry === undefined
          ? undefined
          : {
              isDirectory: () => entry.folder === true,
              mode: entry.mode ?? 0o644,
            },
      );
    },
  };
}

suite('The looks of the parts of a path', () => {
  test('tells of each part whether it is hidden and a file, as the commander lists it', async () => {
    const files = filesOf(
      {
        'C:\\': { folder: true },
        'C:\\Temp': { folder: true },
        'C:\\Temp\\HmxLib.log': {},
      },
      ['C:\\Temp'],
    );
    assert.deepStrictEqual(
      await partLooksOf(['C:\\Temp\\HmxLib.log'], files, 'win32'),
      [
        {
          path: 'C:\\Temp\\HmxLib.log',
          parts: [
            { hidden: false, file: false, executable: false },
            { hidden: true, file: false, executable: false },
            { hidden: false, file: true, executable: false },
          ],
        },
      ],
    );
  });

  test('tells a file that may run as executable outside Windows only, as the commander colors it', async () => {
    const entries = {
      '/': { folder: true },
      '/bin': { folder: true, mode: 0o755 },
      '/bin/tool': { mode: 0o755 },
    } as const;
    const [linux] = await partLooksOf(['/bin/tool'], filesOf(entries), 'linux');
    assert.deepStrictEqual(
      linux.parts.map((part) => part?.executable),
      [false, false, true],
    );
    const [windows] = await partLooksOf(
      ['C:\\tool.exe'],
      filesOf({ 'C:\\': { folder: true }, 'C:\\tool.exe': { mode: 0o755 } }),
      'win32',
    );
    assert.deepStrictEqual(
      windows.parts.map((part) => part?.executable),
      [false, false],
    );
  });

  test('tells nothing of a part that is not there, as the parts inside an archive', async () => {
    const [looks] = await partLooksOf(
      ['C:\\a.zip\\inner.txt'],
      filesOf({ 'C:\\': { folder: true }, 'C:\\a.zip': {} }),
      'win32',
    );
    assert.deepStrictEqual(looks.parts, [
      { hidden: false, file: false, executable: false },
      { hidden: false, file: true, executable: false },
      null,
    ]);
  });

  test('never touches a path on a share or one that is not whole, so a page cannot make the app reach a server', async () => {
    const files = filesOf({});
    assert.deepStrictEqual(
      await partLooksOf(
        ['\\\\server\\share\\a.txt', '//server/share/a.txt', 'relative\\a.txt'],
        files,
        'win32',
      ),
      [
        { path: '\\\\server\\share\\a.txt', parts: [null, null] },
        { path: '//server/share/a.txt', parts: [null, null] },
        { path: 'relative\\a.txt', parts: [null, null] },
      ],
    );
    assert.deepStrictEqual(files.asked, []);
  });
});
