import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, suite, test } from 'vitest';

interface HeavyFile {
  readonly name: string;
  readonly heavy: string;
  readonly before: string;
  readonly after: string;
  readonly oneLine?: true;
}

interface HeavyFiles {
  readonly heavyFiles: () => readonly HeavyFile[];
}

const newline = String.fromCharCode(10);
const tab = String.fromCharCode(9);

let made: HeavyFiles;
let files: readonly HeavyFile[];

function named(name: string): HeavyFile {
  const file = files.find((each) => each.name === name);
  assert.ok(file, name);
  return file;
}

const linesOf = (text: string) => text.split(newline).slice(0, -1);

const median = (values: readonly number[]) =>
  values.toSorted((one, other) => one - other)[Math.floor(values.length / 2)] ??
  0;

const shareOf = (text: string, counted: (code: number) => boolean) => {
  const codes = Array.from(text, (character) => character.codePointAt(0) ?? 0);
  return codes.filter(counted).length / codes.length;
};

suite('The heavy files the frames are measured over', () => {
  beforeAll(async () => {
    const loaded: HeavyFiles = await import(
      pathToFileURL(
        path.join(
          __dirname,
          '..',
          '..',
          '..',
          '..',
          'scripts',
          'playground',
          'heavyFiles.mts',
        ),
      ).href
    );
    made = loaded;
    files = made.heavyFiles();
  });

  test('are the same at every making, so one build is measured over the very text another was', () => {
    assert.deepStrictEqual(made.heavyFiles(), files);
    assert.deepStrictEqual(
      files.map(({ name }) => name),
      [
        'dense.js',
        'reworded.txt',
        'controls.txt',
        'tabs.tsv',
        'wide.txt',
        'minified.js',
        'prose.txt',
        'nemesis.js',
      ],
    );
  });

  test('have a second version each that keeps most of its lines, changes some, drops some and adds some, for the diff and the git tab to compare, the one line of the minified code changed in one place', () => {
    for (const { name, before, after, oneLine } of files) {
      const old = linesOf(before);
      const changed = linesOf(after);
      const kept = new Set(old);
      const same = changed.filter((line) => kept.has(line)).length;
      if (oneLine === true) {
        assert.strictEqual(same, 1, name);
        assert.notStrictEqual(changed[0], old[0], name);
        assert.ok(
          Math.abs((changed[0]?.length ?? 0) - (old[0]?.length ?? 0)) < 5,
          name,
        );
      } else {
        assert.ok(same > old.length * 0.8, `${name} keeps ${same}`);
        assert.ok(changed.length - same > old.length * 0.1, name);
        assert.ok(changed.length < old.length, name);
      }
    }
  });

  test('name as one line the minified code alone, which has no rows to scroll down through until it is wrapped', () => {
    assert.deepStrictEqual(
      files.filter(({ oneLine }) => oneLine === true).map(({ name }) => name),
      ['minified.js'],
    );
  });

  test('hold code of a punctuation mark or operator every few characters, a color span each before a line took the color of most of its tokens, every tenth line several hundred characters long', () => {
    const lines = linesOf(named('dense.js').before);
    assert.strictEqual(lines.length, 3000);
    const marks = lines.map(
      (line) => line.match(/[()[\]{},;=.]/g)?.length ?? 0,
    );
    assert.ok(median(marks) >= 20, `${median(marks)} marks a line`);
    const long = lines.filter((_, index) => index % 10 === 7);
    assert.ok(
      long.every((line) => line.length > 250),
      `${Math.min(...long.map((line) => line.length))}`,
    );
  });

  test('change half the words of every seventh line of a text, a mark around each changed word in the diff', () => {
    const { before, after } = named('reworded.txt');
    const old = linesOf(before)[3]?.split(' ') ?? [];
    const changed = linesOf(after)[3]?.split(' ') ?? [];
    assert.strictEqual(changed.length, old.length);
    assert.ok(old.length >= 10);
    assert.deepStrictEqual(
      changed.filter((_, at) => at % 2 === 0),
      old.filter((_, at) => at % 2 === 0),
    );
    assert.strictEqual(linesOf(after)[4], linesOf(before)[4]);
  });

  test('hold a control character among every seven of lines up to 1,500 long, none of them the null the editor takes a file for binary by, nor a tab or a line end, which the views draw themselves', () => {
    const lines = linesOf(named('controls.txt').before);
    const text = lines.join('');
    const share = shareOf(text, (code) => code < 32 || code === 127);
    assert.ok(share > 0.12 && share < 0.18, String(share));
    assert.ok(!/[\0\t\r]/.test(text));
    assert.ok(Math.max(...lines.map((line) => line.length)) > 1400);
  });

  test('hold rows of 24 cells with a tab between each, a sign drawn for every tab while whitespace shows', () => {
    const lines = linesOf(named('tabs.tsv').before);
    assert.strictEqual(lines.length, 4000);
    assert.ok(lines.every((line) => line.split(tab).length === 24));
  });

  test('hold lines mostly of characters two columns wide, Chinese, Japanese and Korean, fullwidth forms and emoji, each measured and put in a box of its columns', () => {
    const text = linesOf(named('wide.txt').before).join('');
    const share = shareOf(text, (code) => code > 0x2e80);
    assert.ok(share > 0.5, String(share));
    assert.ok(shareOf(text, (code) => code > 0xffff) > 0.1);
  });

  test('hold code on one line of some 300,000 characters, which no view draws whole and the diff still opens', () => {
    const [line = '', map = ''] = linesOf(named('minified.js').before);
    assert.ok(line.length > 250_000 && line.length < 350_000, `${line.length}`);
    assert.ok(map.length < 100);
  });

  test('hold paragraphs of thousands of characters a line, dozens of rows each once wrapped', () => {
    const lengths = linesOf(named('prose.txt').before).map(
      (line) => line.length,
    );
    assert.strictEqual(lengths.length, 500);
    assert.ok(Math.min(...lengths) > 1200, String(Math.min(...lengths)));
  });

  test('hold a nemesis of every cost at once: any forty lines of it, a screen, have code of hundreds of marks, comments, tabs, control characters, wide characters and emoji and a line of several hundred characters, and any fifty a line of thousands, with no null and no carriage return', () => {
    const lines = linesOf(named('nemesis.js').before);
    assert.strictEqual(lines.length, 3000);
    for (let from = 0; from + 40 <= lines.length; from += 20) {
      const screen = lines.slice(from, from + 40);
      const shown = screen.join(newline);
      const codes = Array.from(
        shown,
        (character) => character.codePointAt(0) ?? 0,
      );
      const where = `from line ${from}`;
      assert.ok((shown.match(/[()[\]{},;=.]/g)?.length ?? 0) > 400, where);
      assert.ok(shown.includes('/*'), where);
      assert.ok(shown.includes(tab), where);
      assert.ok(
        codes.some((code) => (code < 32 && code > 10) || code === 127),
        where,
      );
      assert.ok(
        codes.some((code) => code > 0x2e80 && code <= 0xffff),
        where,
      );
      assert.ok(
        codes.some((code) => code > 0xffff),
        where,
      );
      assert.ok(
        screen.some((line) => line.length > 300),
        where,
      );
      assert.ok(
        codes.every((code) => code !== 0 && code !== 13),
        where,
      );
    }
    for (let from = 0; from < lines.length; from += 50) {
      assert.ok(
        lines.slice(from, from + 50).some((line) => line.length > 2000),
        `from line ${from}`,
      );
    }
  });
});
