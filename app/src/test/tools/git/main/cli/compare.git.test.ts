import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  CompareNotFile,
  CompareTooLarge,
  checkedPatch,
  compareMaxBytes,
  comparedFilesPatch,
  comparedImage,
  filesAlike,
} from '../../../../../tools/git/main/cli/compare';
import { parsePatch } from '../../../../../tools/git/page/diff';
import { replaceBuiltin } from '../../../../builtins';
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

  test('shows the line ends that differ, whatever core.autocrlf says', async () => {
    fs.writeFileSync(at('left', 'crlf.txt'), 'one\r\ntwo\r\n');
    fs.writeFileSync(at('right side', 'crlf.txt'), 'one\ntwo\n');

    const [file] = parsePatch(
      await comparedFilesPatch(gitPath, {
        old: at('left', 'crlf.txt'),
        new: at('right side', 'crlf.txt'),
      }),
    );

    assert.ok(
      file?.hunks.some((hunk) =>
        hunk.lines.some((line) => line.kind === 'removed'),
      ),
    );
  });

  test('names files of the same name by their folders too, so they can be told apart', async () => {
    fs.writeFileSync(at('left', 'config.json'), '{ "a": 1 }\n');
    fs.writeFileSync(at('right side', 'config.json'), '{ "a": 2 }\n');

    const [file] = parsePatch(
      await comparedFilesPatch(gitPath, {
        old: at('left', 'config.json'),
        new: at('right side', 'config.json'),
      }),
    );

    assert.strictEqual(file?.path, 'right side/config.json');
    assert.strictEqual(file?.oldPath, 'left/config.json');
  });

  test('compares the content a link leads to, not the link', async (context) => {
    fs.writeFileSync(at('left', 'target.txt'), 'same\n');
    fs.writeFileSync(at('right side', 'copy.txt'), 'same\n');
    try {
      fs.symlinkSync(at('left', 'target.txt'), at('left', 'link.txt'));
    } catch {
      context.skip();
    }

    assert.strictEqual(
      await comparedFilesPatch(gitPath, {
        old: at('left', 'link.txt'),
        new: at('right side', 'copy.txt'),
      }),
      '',
    );
  });

  test('starts git only for the diff, not first to read whether a file system monitor is on, as no repository is read and starting git on Windows may take seconds', async () => {
    const fresh = at('fresh folder');
    fs.mkdirSync(fresh);
    fs.writeFileSync(path.join(fresh, 'one.txt'), 'one\n');
    fs.writeFileSync(path.join(fresh, 'two.txt'), 'two\n');
    const started: string[][] = [];
    const childProcess = process.getBuiltinModule('node:child_process');
    const { spawn } = childProcess;
    replaceBuiltin(
      childProcess,
      'spawn',
      (command: string, args: readonly string[], options: object) => {
        started.push([...args]);
        return spawn(command, args, options);
      },
    );
    try {
      await comparedFilesPatch(gitPath, {
        old: path.join(fresh, 'one.txt'),
        new: path.join(fresh, 'two.txt'),
      });
    } finally {
      replaceBuiltin(childProcess, 'spawn', spawn);
    }

    assert.deepStrictEqual(
      started.map((args) =>
        args.find((arg) => !arg.startsWith('-') && !arg.includes('=')),
      ),
      ['diff'],
    );
  });

  test('refuses what is not a regular file, as a folder', async () => {
    await assert.rejects(
      comparedFilesPatch(gitPath, {
        old: at('left', 'notes.txt'),
        new: at('right side'),
      }),
      CompareNotFile,
    );
  });

  test('takes git saying nothing but an error for the error it is, not for files alike', () => {
    assert.throws(
      () => checkedPatch('', "error: Could not access 'gone.txt'\n"),
      /Could not access/,
    );
    assert.strictEqual(checkedPatch('', ''), '');
    assert.strictEqual(checkedPatch('diff --git', 'warning'), 'diff --git');
  });

  test('tells files alike apart from files that differ only in whitespace', async () => {
    fs.writeFileSync(at('left', 'alike.txt'), 'a b\n');
    fs.writeFileSync(at('right side', 'alike.txt'), 'a b\n');
    fs.writeFileSync(at('right side', 'spaced.txt'), 'a  b\n');

    assert.strictEqual(
      await filesAlike({
        old: at('left', 'alike.txt'),
        new: at('right side', 'alike.txt'),
      }),
      'identical',
    );
    assert.strictEqual(
      await filesAlike({
        old: at('left', 'alike.txt'),
        new: at('right side', 'spaced.txt'),
      }),
      'whitespace',
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
      'left/long.txt',
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
    assert.strictEqual(binary?.path, 'right side/data.bin');
    assert.strictEqual(
      await comparedFilesPatch(gitPath, {
        old: at('left', 'same.txt'),
        new: at('right side', 'same.txt'),
      }),
      '',
    );
  });

  test('gives the page a compared image it names by its side and the id git gave its content, and nothing for another name, the id of the other side or an image changed since', async () => {
    const compared = {
      old: at('left', 'shot.png'),
      new: at('right side', 'shot-new.png'),
    };
    fs.writeFileSync(compared.old, Buffer.from('\0the old image'));
    fs.writeFileSync(compared.new, Buffer.from('\0the new image'));
    const [file] = parsePatch(await comparedFilesPatch(gitPath, compared));
    const oldId = file?.blobs?.old ?? '';
    const newId = file?.blobs?.new ?? '';

    assert.deepStrictEqual(await comparedImage(compared, 'shot.png', oldId), {
      kind: 'image',
      bytes: Buffer.from('\0the old image'),
    });
    assert.deepStrictEqual(
      await comparedImage(compared, 'shot-new.png', newId),
      { kind: 'image', bytes: Buffer.from('\0the new image') },
    );
    for (const [name, id] of [
      ['shot.png', newId],
      ['notes.txt', oldId],
      ['../left/shot.png', oldId],
    ]) {
      assert.deepStrictEqual(await comparedImage(compared, name, id), {
        kind: 'missing',
      });
    }
    fs.writeFileSync(compared.new, Buffer.from('\0changed since'));
    assert.deepStrictEqual(
      await comparedImage(compared, 'shot-new.png', newId),
      { kind: 'missing' },
    );
  });

  test('says a compared image is too large past the size asked for, without reading it', async () => {
    const compared = {
      old: at('left', 'large.png'),
      new: at('right side', 'small.png'),
    };
    fs.writeFileSync(compared.old, Buffer.alloc(64));
    fs.writeFileSync(compared.new, Buffer.alloc(8));

    assert.deepStrictEqual(
      await comparedImage(compared, 'large.png', 'a'.repeat(40), 32),
      { kind: 'tooLarge' },
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
