import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  CompareTooLarge,
  compareMaxBytes,
  comparedFilesPatch,
} from '../../../../../tools/git/main/cli/compare';
import { parsePatch } from '../../../../../tools/git/page/diff';
import {
  installedGit,
  removeFolder,
  tempFolder,
} from '../../../../repositories';

suite('Comparing two files outside any repository', () => {
  let gitPath: string;
  let folder: string;
  const at = (...names: string[]) => path.join(folder, ...names);

  beforeAll(async () => {
    gitPath = await installedGit();
    folder = tempFolder('compare');
    fs.mkdirSync(at('left'));
    fs.mkdirSync(at('right side'));
  });

  afterAll(() => removeFolder(folder));

  test('diffs two files of other folders, naming each side by its own file name', async () => {
    fs.writeFileSync(at('left', 'notes.txt'), 'one\ntwo\nthree\n');
    fs.writeFileSync(at('right side', 'new notes.txt'), 'one\n2\nthree\n');

    const patch = await comparedFilesPatch(gitPath, {
      old: at('left', 'notes.txt'),
      new: at('right side', 'new notes.txt'),
    });

    const [file, ...others] = parsePatch(patch);
    assert.deepStrictEqual(others, []);
    assert.strictEqual(file?.path, 'new notes.txt');
    assert.strictEqual(file?.oldPath, 'notes.txt');
    assert.deepStrictEqual(
      file?.hunks
        .flatMap((hunk) => hunk.lines)
        .map((line) => [line.kind, line.text]),
      [
        ['context', 'one'],
        ['removed', 'two'],
        ['added', '2'],
        ['context', 'three'],
      ],
    );
  });

  test('shows the whole file and leaves changes of whitespace out when asked', async () => {
    const lines = Array.from({ length: 20 }, (_, index) => `line ${index}`);
    fs.writeFileSync(at('left', 'long.txt'), lines.join('\n'));
    fs.writeFileSync(
      at('right side', 'long.txt'),
      lines
        .map((line, index) => (index === 10 ? `${line}  ` : line))
        .join('\n'),
    );
    const compared = {
      old: at('left', 'long.txt'),
      new: at('right side', 'long.txt'),
    };

    assert.strictEqual(
      parsePatch(await comparedFilesPatch(gitPath, compared))[0]?.oldPath,
      undefined,
    );
    assert.strictEqual(
      await comparedFilesPatch(gitPath, compared, { ignoreWhitespace: true }),
      '',
    );
    const whole = parsePatch(
      await comparedFilesPatch(gitPath, compared, { entireFile: true }),
    )[0];
    assert.strictEqual(
      whole?.hunks
        .flatMap((hunk) => hunk.lines)
        .filter((line) => line.kind === 'context').length,
      19,
    );
  });

  test('says binary files differ, and gives nothing for files alike', async () => {
    fs.writeFileSync(at('left', 'data.bin'), Buffer.from([0, 1, 2]));
    fs.writeFileSync(at('right side', 'data.bin'), Buffer.from([0, 1, 3]));
    fs.writeFileSync(at('left', 'same.txt'), 'same');
    fs.writeFileSync(at('right side', 'same.txt'), 'same');

    const [binary] = parsePatch(
      await comparedFilesPatch(gitPath, {
        old: at('left', 'data.bin'),
        new: at('right side', 'data.bin'),
      }),
    );
    assert.strictEqual(binary?.binary, true);
    assert.strictEqual(binary?.path, 'data.bin');
    assert.strictEqual(
      await comparedFilesPatch(gitPath, {
        old: at('left', 'same.txt'),
        new: at('right side', 'same.txt'),
      }),
      '',
    );
  });

  test('refuses files larger together than a patch may be', async () => {
    const large = at('left', 'large.txt');
    const handle = fs.openSync(large, 'w');
    fs.ftruncateSync(handle, compareMaxBytes + 1);
    fs.closeSync(handle);

    await assert.rejects(
      comparedFilesPatch(gitPath, { old: large, new: at('left', 'notes.txt') }),
      CompareTooLarge,
    );
  });
});
