import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import {
  sevenZipAt,
  sevenZipProgram,
} from '../../../../../tools/commander/main/sevenZip';

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
