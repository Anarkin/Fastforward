import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import { sevenZipReader } from '../../../../../tools/commander/main/sevenZipReader';
import { type Asked, listedBy } from './sevenZipFixtures';

suite('deleting with 7-Zip', () => {
  test('deletes the items named from a list file without wildcards, telling what it keeps and how far it got, the password on its input', async () => {
    const listIn = tempFolder('removing');
    const asked: { args: readonly string[]; input?: string; list?: string }[] =
      [];
    const totals: unknown[] = [];
    try {
      const removed = await sevenZipReader((args, { input, onOutput } = {}) => {
        const list = args.find((arg) => arg.startsWith('-i@'))?.slice(3);
        asked.push({
          args,
          ...(input !== undefined && { input }),
          ...(list !== undefined && { list: fs.readFileSync(list, 'utf8') }),
        });
        onOutput?.(
          'Delete data from archive: 2 folders, 3 files, 6 bytes (1 KiB)\nKeep old data in archive: 1 file, 2 bytes (1 KiB)\nAdd new data to archive: 0 files, 0 bytes\n',
        );
        return Promise.resolve({ code: 0, output: '', errors: '' });
      }).remove('a.7z', ['docs', 'a.txt'], {
        listIn,
        password: 'secret',
        onTotals: (told) => totals.push(told),
        onProgress: () => undefined,
      });
      const list = asked[0]?.args.find((arg) => arg.startsWith('-i@'));
      assert.deepStrictEqual(removed, { kind: 'packed' });
      assert.deepStrictEqual(asked, [
        {
          args: [
            'd',
            '-y',
            '-spd',
            '-sccUTF-8',
            '-scsUTF-8',
            '-ssc',
            '-bsp1',
            list,
            '--',
            'a.7z',
          ],
          input: 'secret\n',
          list: '"docs"\n"a.txt"',
        },
      ]);
      assert.deepStrictEqual(totals, [{ files: 1, bytes: 2 }]);
      assert.deepStrictEqual(fs.readdirSync(listIn), []);
    } finally {
      removeFolder(listIn);
    }
  });
});

const askedBy = async (
  change: (reader: ReturnType<typeof sevenZipReader>) => Promise<unknown>,
) => {
  const asked: Asked[] = [];
  await change(
    sevenZipReader((args, options) => {
      asked.push({ args, ...options, onOutput: undefined, ...listedBy(args) });
      return Promise.resolve({ code: 0, output: '', errors: '' });
    }),
  );
  return asked;
};

suite('changing an archive with 7-Zip', () => {
  test('renames an item of an archive by its path in it, the password on its input or none asked for', async () => {
    assert.deepStrictEqual(
      await askedBy((reader) =>
        reader.rename('a.7z', 'docs/old.txt', 'docs/new.txt', {
          password: 'secret',
        }),
      ),
      [
        {
          args: [
            'rn',
            '-y',
            '-spd',
            '-sccUTF-8',
            '-scsUTF-8',
            '-ssc',
            '--',
            'a.7z',
            'docs/old.txt',
            'docs/new.txt',
          ],
          input: 'secret\n',
          onOutput: undefined,
        },
      ],
    );
    const [unlocked] = await askedBy((reader) =>
      reader.rename('a.zip', 'a', 'b', {}),
    );
    assert.ok(unlocked?.args.includes('-p-'));
  });

  test('adds the items named in a list file from the folder they are in, so they keep their folders under it and any number of them fits on the command line, setting no password unless one is given, as -p- would set the password -, and giving it twice, as 7-Zip asks once to open a 7z with its names encrypted and again for what it adds', async () => {
    const listIn = tempFolder('adding');
    const list = path.join(listIn, 'added.paths');
    try {
      assert.deepStrictEqual(
        await askedBy((reader) =>
          reader.add('a.zip', 'stage', ['docs/fresh', 'b.txt'], { listIn }),
        ),
        [
          {
            args: [
              'a',
              '-y',
              '-ssw',
              '-sccUTF-8',
              '-scsUTF-8',
              '-spd',
              `-i@${list}`,
              '--',
              'a.zip',
            ],
            cwd: 'stage',
            onOutput: undefined,
            list: '"docs/fresh"\n"b.txt"',
          },
        ],
      );
      const [locked] = await askedBy((reader) =>
        reader.add('a.7z', 'stage', ['x'], { listIn, password: 'secret' }),
      );
      assert.deepStrictEqual(
        [locked?.args.includes('-p'), locked?.input],
        [true, 'secret\nsecret\n'],
      );
      assert.deepStrictEqual(
        await askedBy((reader) =>
          reader.add('a.zip', 'stage', ['two\nlines'], { listIn }),
        ),
        [],
      );
      assert.deepStrictEqual(fs.readdirSync(listIn), []);
    } finally {
      removeFolder(listIn);
    }
  });
});

suite('testing an archive with 7-Zip', () => {
  test('tests every file of an archive against its checksum, the password on its input or none asked for, passing it only when 7-Zip finds nothing wrong', async () => {
    const asked: Asked[] = [];
    const tested = (code: number, password?: string) =>
      sevenZipReader((args, options) => {
        asked.push({ args, ...options, onOutput: undefined });
        return Promise.resolve({
          code,
          output: '',
          errors: code === 0 ? '' : 'ERROR: CRC Failed : a.txt\n',
        });
      }).test('a.zip', {
        ...(password !== undefined && { password }),
        onProgress: () => undefined,
      });
    assert.deepStrictEqual(await tested(0, 'secret'), { kind: 'packed' });
    assert.deepStrictEqual(await tested(1), {
      kind: 'refused',
      reason: 'CRC Failed : a.txt',
    });
    assert.deepStrictEqual(asked, [
      {
        args: ['t', '-y', '-sccUTF-8', '-bsp1', '--', 'a.zip'],
        input: 'secret\n',
        onOutput: undefined,
      },
      {
        args: ['t', '-y', '-p-', '-sccUTF-8', '-bsp1', '--', 'a.zip'],
        onOutput: undefined,
      },
    ]);
  });
});

suite('the password of an archive', () => {
  test('gives 7-Zip a password on its input rather than among its arguments, where other programs could read it, and a refusal for a wrong one says a password is needed', async () => {
    const asked: { args: readonly string[]; input: string | undefined }[] = [];
    const reader = sevenZipReader((args, { input } = {}) => {
      asked.push({ args, input });
      return Promise.resolve({
        code: 2,
        output: '',
        errors:
          'ERROR: a.7z : Cannot open encrypted archive. Wrong password?\n',
      });
    });
    assert.deepStrictEqual(await reader.list('a.7z', undefined, 'secret'), {
      kind: 'refused',
      reason: 'Cannot open encrypted archive. Wrong password?',
      needsPassword: true,
    });
    const into = path.join(tempFolder('password'), 'out');
    try {
      await reader.extract('a.7z', ['a.txt'], into, { password: 'secret' });
    } finally {
      removeFolder(path.dirname(into));
    }
    await reader.list('a.7z');
    assert.deepStrictEqual(
      asked.map(({ args, input }) => [
        args.includes('-p-'),
        args.some((arg) => arg.includes('secret')),
        input,
      ]),
      [
        [false, false, 'secret\n'],
        [false, false, 'secret\n'],
        [true, false, undefined],
      ],
    );
  });
});

const erase = (shown: string) =>
  `${'\b'.repeat(shown.length)}${' '.repeat(shown.length)}${'\b'.repeat(shown.length)}`;

suite('the progress of an extraction', () => {
  test('asks 7-Zip for its progress alone when the extraction is followed, telling the last of each piece of what it prints, a piece cut between two reads too', async () => {
    const asked: (readonly string[])[] = [];
    const told: unknown[] = [];
    const reader = sevenZipReader((args, { onOutput } = {}) => {
      asked.push(args);
      for (const text of ['  0%\r    \r 12% 3 - a', '.txt\r', '\r 50% 7']) {
        onOutput?.(text);
      }
      return Promise.resolve({ code: 0, output: '', errors: '' });
    });
    const into = path.join(tempFolder('progress'), 'out');
    try {
      await reader.extract('a.zip', ['a.txt'], into, {
        onProgress: (progress) => told.push(progress),
      });
    } finally {
      removeFolder(path.dirname(into));
    }
    assert.ok(asked[0]?.includes('-bsp1') && asked[0].includes('-bso0'));
    assert.deepStrictEqual(told, [
      { percent: 0, files: 0 },
      { percent: 12, files: 3, current: 'a.txt' },
    ]);
  });

  test('reads the progress 7-Zip erases with backspaces rather than a carriage return, as it does on macOS and Linux', async () => {
    const told: unknown[] = [];
    const reader = sevenZipReader((_args, { onOutput } = {}) => {
      onOutput?.(`  0%${erase('  0%')} 12% 3 - a`);
      onOutput?.(`.txt${erase(' 12% 3 - a.txt')} 50% 7`);
      return Promise.resolve({ code: 0, output: '', errors: '' });
    });
    const into = path.join(tempFolder('progress'), 'out');
    try {
      await reader.extract('a.zip', ['a.txt'], into, {
        onProgress: (progress) => told.push(progress),
      });
    } finally {
      removeFolder(path.dirname(into));
    }

    assert.deepStrictEqual(told, [
      { percent: 0, files: 0 },
      { percent: 12, files: 3, current: 'a.txt' },
    ]);
  });
});
