import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import {
  sevenZipAt,
  sevenZipReader,
  type SevenZipRun,
} from '../../../../../tools/commander/main/sevenZip';
import type { PackPlan } from '../../../../../tools/commander/main/archives';
import { ran, type Asked, listedBy } from './sevenZipFixtures';

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
