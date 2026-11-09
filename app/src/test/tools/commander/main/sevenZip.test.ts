import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../../../repositories';
import {
  progressOf,
  reasonOf,
  sevenZipProgram,
  sevenZipReader,
  type SevenZip,
  type SevenZipRun,
} from '../../../../tools/commander/main/sevenZip';

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
  });
});

suite('reasonOf', () => {
  test('joins the errors 7-Zip names, without the file they are about, or says how 7-Zip ended when it names none', () => {
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

suite('the progress of an extraction', () => {
  test('reads how far 7-Zip got, how many files it took out and the one it is taking, leaving out how far it got opening and scanning', () => {
    assert.deepStrictEqual(progressOf(' 18% 1029 - folder-0010/file.txt'), {
      percent: 18,
      files: 1029,
      current: 'folder-0010/file.txt',
    });
    assert.deepStrictEqual(progressOf('  8% 496'), { percent: 8, files: 496 });
    assert.deepStrictEqual(progressOf('  0%'), { percent: 0, files: 0 });
    assert.strictEqual(progressOf(' 81% 4096 Open'), undefined);
    assert.strictEqual(progressOf('  0M Scan C:/archives/'), undefined);
  });

  test('asks 7-Zip for its progress alone when the extraction is followed, telling the last of each piece of what it prints, a piece cut between two reads too', async () => {
    const asked: (readonly string[])[] = [];
    const told: unknown[] = [];
    const reader = sevenZipReader((args, _signal, onOutput) => {
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
});
