import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../repositories';
import {
  progressOf,
  reasonOf,
  sevenZipAt,
  sevenZipProgram,
  sevenZipReader,
  type SevenZip,
  type SevenZipRun,
} from '../../../../tools/commander/main/sevenZip';
import type { PackPlan } from '../../../../tools/commander/main/archives';

const listed = `
7-Zip 26.06 (x64) : Copyright (c) 1999-2026 Igor Pavlov : 2026-11-06

Scanning the drive for archives:
1 file, 448 bytes (1 KiB)

Listing archive: plain.zip

--
Path = plain.zip
Type = zip
Physical Size = 448

----------
Path = docs
Folder = +
Size = 0
Packed Size = 2
Modified = 2026-11-09 12:36:50
Attributes = DvPUM 41A40000
Encrypted = -

Path = docs/readme.md
Folder = -
Size = 900
Packed Size = 24
Modified = 2026-11-09 12:36:50.4412186
Attributes = HA
Encrypted = +

Path = src/app/main.ts
Folder = -
Size = 11
Modified = 2026-11-09 12:36:50
Attributes = A
Symbolic Link = ../outside

`;

function ran(run: Partial<SevenZipRun>): SevenZip {
  return () =>
    Promise.resolve({ code: 0, output: '', errors: '', ...run } as const);
}

suite('sevenZipReader', () => {
  test('asks 7-Zip for the technical listing in UTF-8, with slashes, UTC times and a password that never prompts, after -- so no name is taken for a switch', async () => {
    const asked: (readonly string[])[] = [];
    await sevenZipReader((args) => {
      asked.push(args);
      return Promise.resolve({ code: 0, output: listed, errors: '' });
    }).list('-dash.zip');
    assert.deepStrictEqual(asked, [
      ['l', '-slt', '-sccUTF-8', '-slsl', '-slmu', '-p-', '--', '-dash.zip'],
    ]);
  });

  test('reads each item of the listing, its folder, size, UTC time, hidden attribute, link and encryption', async () => {
    assert.deepStrictEqual(
      await sevenZipReader(ran({ output: listed })).list('plain.zip'),
      {
        kind: 'listed',
        items: [
          {
            path: 'docs',
            folder: true,
            size: undefined,
            modified: Date.UTC(2026, 10, 9, 12, 36, 50),
            hiddenAttribute: false,
            link: false,
            encrypted: false,
          },
          {
            path: 'docs/readme.md',
            folder: false,
            size: 900,
            modified: Date.UTC(2026, 10, 9, 12, 36, 50, 441),
            hiddenAttribute: true,
            link: false,
            encrypted: true,
          },
          {
            path: 'src/app/main.ts',
            folder: false,
            size: 11,
            modified: Date.UTC(2026, 10, 9, 12, 36, 50),
            hiddenAttribute: false,
            link: true,
            encrypted: false,
          },
        ],
      },
    );
  });

  test('takes a warning of 7-Zip with a listing as listed, and an error or no listing as refused, with the reason 7-Zip gives, noting when 7-Zip sees no archive in the file at all, rather than one of a format it names that it could not open', async () => {
    assert.strictEqual(
      (await sevenZipReader(ran({ code: 1, output: listed })).list('plain.zip'))
        .kind,
      'listed',
    );
    assert.deepStrictEqual(
      await sevenZipReader(
        ran({
          code: 2,
          errors: '\nERROR: C:/big.mp4 : Cannot open the file as archive\n',
        }),
      ).list('C:\\big.mp4'),
      {
        kind: 'refused',
        reason: 'Cannot open the file as archive',
        noArchive: true,
      },
    );
    assert.deepStrictEqual(
      await sevenZipReader(
        ran({
          code: 2,
          errors:
            'ERROR: a.zip : a.zip\nOpen ERROR: Cannot open the file as [zip] archive\n\nERRORS:\nIs not archive\n',
        }),
      ).list('a.zip'),
      { kind: 'refused', reason: 'Cannot open the file as [zip] archive' },
    );
    assert.deepStrictEqual(
      await sevenZipReader(ran({ code: 0, output: 'no listing' })).list(
        'a.zip',
      ),
      { kind: 'refused', reason: '7-Zip ended with code 0.' },
    );
  });

  test('takes an item without a Folder field for a folder by the D of its attributes, as a 7z lists its folders, and d for a device', async () => {
    const listing = await sevenZipReader(
      ran({
        output: [
          '----------',
          'Path = docs',
          'Size = 0',
          'Attributes = D',
          '',
          'Path = docs/a.txt',
          'Size = 3',
          'Attributes = A',
          '',
          'Path = device',
          'Size = 0',
          'Attributes = d',
          '',
        ].join('\n'),
      }),
    ).list('a.7z');
    assert.deepStrictEqual(
      listing.kind === 'listed' &&
        listing.items.map((each) => [each.path, each.folder, each.size]),
      [
        ['docs', true, undefined],
        ['docs/a.txt', false, 3],
        ['device', false, 0],
      ],
    );
  });
});

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

suite('sevenZipAt', () => {
  const node = sevenZipAt(process.execPath);

  test('runs 7-Zip in the folder asked for, so the items it packs keep the folders they are in under it', async () => {
    const folder = tempFolder('cwd');
    try {
      const run = await node(['-e', 'process.stdout.write(process.cwd())'], {
        cwd: folder,
      });
      assert.strictEqual(
        fs.realpathSync.native(run.output),
        fs.realpathSync.native(folder),
      );
    } finally {
      removeFolder(folder);
    }
  });

  test('pipes what 7-Zip writes into a second 7-Zip, telling the progress the first writes to its errors and ending as the second does, or as the first when it fails', async () => {
    const told: string[] = [];
    const passed = await node(
      [
        '-e',
        "process.stderr.write(' 50% 1 - a.txt'); process.stdout.write('tar')",
      ],
      {
        pipeInto: [
          '-e',
          "let read = ''; process.stdin.on('data', (data) => (read += data)); process.stdin.on('end', () => process.stdout.write(`gzip of ${read}`))",
        ],
        onOutput: (text) => told.push(text),
      },
    );
    assert.deepStrictEqual(
      [passed.code, passed.output, told.join('')],
      [0, 'gzip of tar', ' 50% 1 - a.txt'],
    );

    const failed = await node(
      ['-e', "process.stderr.write('ERROR: locked'); process.exit(2)"],
      { pipeInto: ['-e', 'process.stdin.resume()'] },
    );
    assert.deepStrictEqual(
      [failed.code, failed.errors.includes('ERROR: locked')],
      [2, true],
    );
  });

  test('ends as the second 7-Zip does once it fails while the first still writes to it, stopping the first, which would wait for ever on a pipe nobody reads', async () => {
    const failed = await node(
      [
        '-e',
        'const piece = Buffer.alloc(65536, 1); const more = () => process.stdout.write(piece, more); more()',
      ],
      {
        pipeInto: [
          '-e',
          "process.stderr.write('ERROR: disk full'); process.exit(2)",
        ],
      },
    );

    assert.deepStrictEqual(
      [failed.code, failed.errors.includes('ERROR: disk full')],
      [2, true],
    );
  });

  test('ends with the warning of the first 7-Zip once the second packed what it was given, as the first could not read some files', async () => {
    const warned = await node(
      [
        '-e',
        "process.stderr.write('WARNINGS for files:\\nlocked.txt : in use\\n'); process.stdout.write('tar'); process.exitCode = 1",
      ],
      { pipeInto: ['-e', 'process.stdin.resume()'] },
    );

    assert.deepStrictEqual(
      [warned.code, warned.errors.includes('locked.txt : in use')],
      [1, true],
    );
  });
});

interface Asked {
  readonly args: readonly string[];
  readonly onOutput: undefined;
  readonly input?: string;
  readonly cwd?: string;
  readonly pipeInto?: readonly string[];
  readonly signal?: AbortSignal;
  readonly list?: string;
}

const listedBy = (args: readonly string[]) => {
  const list = args.find((arg) => arg.startsWith('-i@'))?.slice(3);
  return list === undefined ? {} : { list: fs.readFileSync(list, 'utf8') };
};

suite('packing with 7-Zip', () => {
  const plan: PackPlan = {
    folder: path.join('D:', 'src'),
    items: ['a.txt', 'docs'],
    archive: path.join('D:', 'out', 'photos.tar.gz'),
    format: 'zip',
    level: 'normal',
  };
  let out = '';
  let into = '';
  beforeEach(() => {
    out = tempFolder('packing');
    into = path.join(out, 'photos.part');
  });
  afterEach(() => {
    removeFolder(out);
  });
  const packedBy = async (
    planned: PackPlan,
    run: Partial<SevenZipRun> = {},
    onProgress?: () => void,
  ) => {
    const asked: Asked[] = [];
    const result = await sevenZipReader((args, options) => {
      asked.push({ args, ...options, onOutput: undefined, ...listedBy(args) });
      return Promise.resolve({ code: 0, output: '', errors: '', ...run });
    }).pack(planned, into, onProgress === undefined ? {} : { onProgress });
    return { asked, result };
  };
  const common = ['-ssw', '-sccUTF-8', '-scsUTF-8', '-spd'];
  const argsOf = async (planned: PackPlan) => {
    const [asked] = (await packedBy(planned)).asked;
    return [asked?.args.slice(1, -3).join(' '), asked?.input];
  };

  test('packs the items named in a list file from the folder they are in, so they keep the folders under it and any number of them fits on the command line, the archive after -- so its name is taken for no switch, without wildcards and with the files other apps are writing, removing the list once done', async () => {
    assert.deepStrictEqual((await packedBy(plan)).asked, [
      {
        args: ['a', '-tzip', '-mx5', ...common, `-i@${into}.paths`, '--', into],
        cwd: plan.folder,
        onOutput: undefined,
        list: '"a.txt"\n"docs"',
      },
    ]);
    assert.deepStrictEqual(fs.readdirSync(out), []);
  });

  test('refuses to pack an item whose name holds a line break, which a list file cannot hold, without running 7-Zip', async () => {
    assert.deepStrictEqual(
      await packedBy({ ...plan, items: ['a.txt', 'two\nlines.txt'] }),
      {
        asked: [],
        result: { kind: 'refused', reason: strings.commander.lineBreakInName },
      },
    );
  });

  test('gives 7-Zip the password on its input, encrypting a zip with AES-256 or ZipCrypto as chosen, the names of a 7z too when asked, and no tar', async () => {
    const password = 'pässwörd';
    assert.deepStrictEqual(await argsOf({ ...plan, password }), [
      `-tzip -mx5 -p -mem=AES256 ${common.join(' ')}`,
      `${password}\n`,
    ]);
    assert.deepStrictEqual(
      await argsOf({ ...plan, password, zipCipher: 'zipCrypto' }),
      [`-tzip -mx5 -p -mem=ZipCrypto ${common.join(' ')}`, `${password}\n`],
    );
    assert.deepStrictEqual(
      await argsOf({
        ...plan,
        format: '7z',
        level: 'ultra',
        password,
        encryptNames: true,
      }),
      [`-t7z -mx9 -p -mhe=on ${common.join(' ')}`, `${password}\n`],
    );
    assert.deepStrictEqual(
      await argsOf({ ...plan, format: 'tar', level: 'store', password }),
      [`-ttar ${common.join(' ')}`, undefined],
    );
  });

  test('packs a compressed tar by piping the tar 7-Zip writes into a second 7-Zip naming the tar after the archive, cut into volumes of the size asked, telling the progress of the first', async () => {
    const { asked } = await packedBy(
      { ...plan, format: 'tar.gz', level: 'maximum', volumeBytes: 1_048_576 },
      {},
      () => undefined,
    );
    assert.deepStrictEqual(asked, [
      {
        args: [
          'a',
          '-ttar',
          '-so',
          '-an',
          ...common,
          '-bso2',
          '-bsp2',
          `-i@${into}.paths`,
          '--',
        ],
        cwd: plan.folder,
        pipeInto: [
          'a',
          '-tgzip',
          '-mx7',
          '-siphotos.tar',
          '-v1048576b',
          '-bso0',
          '-bsp0',
          '--',
          into,
        ],
        onOutput: undefined,
        list: '"a.txt"\n"docs"',
      },
    ]);
  });

  test('tells the files and bytes 7-Zip is to pack once it has scanned them, and how far it got in them', async () => {
    const totals: unknown[] = [];
    const progress: unknown[] = [];
    await sevenZipReader((_args, { onOutput } = {}) => {
      for (const text of [
        'Scanning the drive:\r\n  0M Scan \r601 folders, 301 files, 150000600 bytes (144 MiB)\r\n',
        'Creating archive: a.zip\r\nAdd new data to archive: 601 folders, 301 files, 150000600 bytes (144 MiB)\r\n',
        '  6% 4 + docs/a.txt\r',
        '\r\nAdd new data to archive: 1 file, 6 bytes (1 KiB)\r\n',
      ]) {
        onOutput?.(text);
      }
      return Promise.resolve({ code: 0, output: '', errors: '' });
    }).pack(plan, into, {
      onTotals: (told) => totals.push(told),
      onProgress: (told) => progress.push(told),
    });
    assert.deepStrictEqual(totals, [
      { files: 301, bytes: 150_000_600 },
      { files: 1, bytes: 6 },
    ]);
    assert.deepStrictEqual(progress, [
      { percent: 6, files: 4, current: 'docs/a.txt' },
    ]);
  });

  test('takes a warning of 7-Zip as packed, naming the files it could not read and why, three of them and how many more, and an error as refused', async () => {
    const locked =
      'The process cannot access the file because it is being used by another process.';
    const warned = (names: readonly string[]) =>
      [
        '',
        `WARNING: ${locked}`,
        names[0],
        '',
        '',
        'WARNINGS for files:',
        '',
        ...names.map((name) => `${name} : ${locked}`),
        '----------------',
        `WARNING: Cannot open ${names.length} file`,
        '',
      ].join('\r\n');
    assert.deepStrictEqual(
      (await packedBy(plan, { code: 1, errors: warned(['docs/s1.txt']) }))
        .result,
      { kind: 'packed', warning: `docs/s1.txt: ${locked}` },
    );
    assert.deepStrictEqual(
      (
        await packedBy(plan, {
          code: 1,
          errors: warned(['a', 'b', 'c', 'd', 'e']),
        })
      ).result,
      {
        kind: 'packed',
        warning: [
          `a: ${locked}`,
          `b: ${locked}`,
          `c: ${locked}`,
          strings.commander.warnedMore(2),
        ].join(' '),
      },
    );
    assert.deepStrictEqual(
      (
        await packedBy(plan, {
          code: 1,
          output: [
            'Scanning the drive:',
            'WARNING: Access is denied.',
            'files\\attributes\\unreadable\\',
            '',
            'Scan WARNINGS for files and folders:',
            '',
            'files\\attributes\\unreadable\\ : Access is denied.',
            '----------------',
            'Scan WARNINGS: 1',
          ].join('\r\n'),
        })
      ).result,
      {
        kind: 'packed',
        warning: 'files\\attributes\\unreadable\\: Access is denied.',
      },
    );
    assert.deepStrictEqual((await packedBy(plan)).result, { kind: 'packed' });
    assert.deepStrictEqual(
      (await packedBy(plan, { code: 2, errors: 'ERROR: disk full\n' })).result,
      { kind: 'refused', reason: 'disk full' },
    );
  });
});

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
