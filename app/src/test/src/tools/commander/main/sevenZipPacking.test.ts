import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import type { SevenZipRun } from '../../../../../tools/commander/main/sevenZip';
import { sevenZipReader } from '../../../../../tools/commander/main/sevenZipReader';
import type { PackPlan } from '../../../../../tools/commander/main/archiveReader';
import { type Asked, listedBy } from './sevenZipFixtures';

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
