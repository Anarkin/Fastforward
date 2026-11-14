import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import {
  progressOf,
  reasonOf,
  sevenZipProgram,
  sevenZipReader,
} from '../../../../../tools/commander/main/sevenZip';
import { ran, type Asked, listedBy } from './sevenZipFixtures';

const zstd = [
  '--',
  'Path = project.tar.zst',
  'Type = zstd',
  '',
  '----------',
  'Size = ',
  'Packed Size = ',
  '',
].join('\n');

const namedInZstd = async (file: string) => {
  const listing = await sevenZipReader(ran({ output: zstd })).list(file);
  return listing.kind === 'listed'
    ? listing.items.map((each) => [each.path, each.folder, each.size])
    : listing.reason;
};

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

suite('the one item of a compressed file', () => {
  test('takes the name 7-Zip extracts it by when the listing names none, the name of the file without its extension, or with .tar for the extensions of a compressed tar', async () => {
    assert.deepStrictEqual(
      await namedInZstd(path.join('C:', 'project.tar.zst')),
      [['project.tar', false, undefined]],
    );
    assert.deepStrictEqual(await namedInZstd('p.tzst'), [
      ['p.tar', false, undefined],
    ]);
    assert.deepStrictEqual(await namedInZstd('backup.TGZ'), [
      ['backup.tar', false, undefined],
    ]);
    assert.deepStrictEqual(await namedInZstd('notes'), [
      ['notes', false, undefined],
    ]);
    assert.deepStrictEqual(await namedInZstd('backup.tar.xz.001'), [
      ['backup.tar', false, undefined],
    ]);
  });
});

suite('reasonOf', () => {
  test('joins the errors 7-Zip names, without the file they are about, taking the line after an error naming only the file, or says how 7-Zip ended when it names none', () => {
    assert.strictEqual(
      reasonOf(
        {
          code: 2,
          output: '',
          errors:
            'ERROR: a.tar.gz : a.tar.gz\nOpen ERROR: Cannot open the file as [tar] archive\n\nERRORS:\nIs not archive\n',
        },
        'a.tar.gz',
      ),
      'Cannot open the file as [tar] archive',
    );
    assert.strictEqual(
      reasonOf(
        {
          code: 2,
          output: '',
          errors:
            '\nERRORS:\nUnexpected end of archive\nThere are data after the end of archive\n\nErrors: 1\n',
        },
        'cut-short.zip',
      ),
      'Unexpected end of archive There are data after the end of archive',
    );
    assert.strictEqual(
      reasonOf(
        {
          code: 2,
          output:
            '--\nPath = cut-short.zip\nType = zip\nERRORS:\nUnexpected end of archive\nPhysical Size = 490\nCharacteristics = Local\n\n----------\n',
          errors: '\nERRORS:\nUnexpected end of archive\n\nErrors: 1\n',
        },
        'cut-short.zip',
      ),
      'Unexpected end of archive',
    );
    assert.strictEqual(
      reasonOf(
        {
          code: 2,
          output: '',
          errors:
            'ERROR: C:\\archives\\a.7z\r\nCannot open encrypted archive. Wrong password?\r\n\r\nERRORS:\r\nHeaders Error\r\n',
        },
        'C:\\archives\\a.7z',
      ),
      'Cannot open encrypted archive. Wrong password?',
    );
    assert.strictEqual(
      reasonOf(
        {
          code: 2,
          output: '',
          errors: '\r\n\r\nSystem ERROR:\r\nThe parameter is incorrect.\r\n',
        },
        'a.zip',
      ),
      'The parameter is incorrect.',
    );
    assert.strictEqual(
      reasonOf(
        {
          code: 2,
          output: '',
          errors: '\r\nError:\r\nThe file is read-only\r\n\r\nErrors: 1\r\n',
        },
        'ro.zip',
      ),
      'The file is read-only',
    );
    assert.strictEqual(
      reasonOf({ code: 255, output: '', errors: '' }, 'a.zip'),
      '7-Zip ended with code 255.',
    );
    assert.strictEqual(
      reasonOf({ code: null, output: '', errors: '' }, 'a.zip'),
      '7-Zip was stopped.',
    );
  });
});

suite('sevenZipProgram', () => {
  test('runs 7-Zip from the resources of the packaged app, and from the build folder of the platform otherwise', () => {
    assert.strictEqual(
      sevenZipProgram({
        packaged: true,
        resourcesPath: path.join('app', 'resources'),
        appPath: 'ignored',
        platform: 'win32',
        arch: 'x64',
      }),
      path.join('app', 'resources', '7zip', '7z.exe'),
    );
    assert.strictEqual(
      sevenZipProgram({
        packaged: false,
        resourcesPath: 'ignored',
        appPath: 'repo',
        platform: 'darwin',
        arch: 'arm64',
      }),
      path.join('repo', 'build', '7zip', 'darwin-arm64', '7zz'),
    );
  });
});

const erase = (shown: string) =>
  `${'\b'.repeat(shown.length)}${' '.repeat(shown.length)}${'\b'.repeat(shown.length)}`;

suite('the progress of an extraction', () => {
  test('reads how far 7-Zip got, how many files it took out and the one it is taking, adding or copying as it packs too, leaving out how far it got opening and scanning', () => {
    assert.deepStrictEqual(progressOf(' 18% 1029 - folder-0010/file.txt'), {
      percent: 18,
      files: 1029,
      current: 'folder-0010/file.txt',
    });
    assert.deepStrictEqual(progressOf('  6% 4 + s3.txt'), {
      percent: 6,
      files: 4,
      current: 's3.txt',
    });
    assert.deepStrictEqual(progressOf(' 76% = big.bin'), {
      percent: 76,
      files: 0,
      current: 'big.bin',
    });
    assert.deepStrictEqual(progressOf('  8% 496'), { percent: 8, files: 496 });
    assert.deepStrictEqual(progressOf('  0%'), { percent: 0, files: 0 });
    assert.strictEqual(progressOf(' 81% 4096 Open'), undefined);
    assert.strictEqual(progressOf('  0M Scan C:/archives/'), undefined);
  });

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
