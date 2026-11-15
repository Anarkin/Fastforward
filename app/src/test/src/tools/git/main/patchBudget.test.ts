import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  leftOutOf,
  PatchBudget,
} from '../../../../../tools/git/main/patchBudget';
import { type FileChange } from '../../../../../tools/git/shared/protocol';
import {
  collapseThreshold,
  patchByteBudget,
} from '../../../../../tools/git/shared/patchBudget';
import { section } from './patchFixtures';
import { fileChange } from '../../../../helpers/gitValues';

function read(chunks: readonly string[]) {
  const budget = new PatchBudget();
  for (const chunk of chunks) {
    budget.add(Buffer.from(chunk));
  }
  return budget.end();
}

const numbered = (index: number) => `${String(index).padStart(3, '0')}.json`;

suite('Patch budget', () => {
  test('keeps each file within the budget and leaves out one over 25000 changed lines with its count, counting only the changed lines of its hunks, from output split anywhere, as the page would freeze laying it out', () => {
    const output =
      section('a.ts', 2) + section('large.json', 25_001) + section('b.ts', 3);
    for (const split of [0, 10, output.indexOf('large.json') + 3, 2000]) {
      const read2 = read([output.slice(0, split), output.slice(split)]);
      assert.strictEqual(read2.patch, section('a.ts', 2) + section('b.ts', 3));
      assert.deepStrictEqual(read2.sections, [
        { header: 'diff --git a/a.ts b/a.ts', lines: 2, kept: true },
        {
          header: 'diff --git a/large.json b/large.json',
          lines: 25_001,
          kept: false,
        },
        { header: 'diff --git a/b.ts b/b.ts', lines: 3, kept: true },
      ]);
      assert.strictEqual(read2.stopped, false);
    }
    assert.deepStrictEqual(read([section('exact.json', 25_000)]).sections, [
      {
        header: 'diff --git a/exact.json b/exact.json',
        lines: 25_000,
        kept: true,
      },
    ]);
  });

  test('keeps up to 25000 changed lines in all, leaving out the file that takes the patch past them with its count and stopping there, as the page would freeze laying them out', () => {
    const budget = new PatchBudget();
    const stops = [12_500, 12_500, 1, 1].map((lines, index) =>
      budget.add(Buffer.from(section(`${index}.txt`, lines))),
    );
    const { sections, stopped } = budget.end();
    assert.strictEqual(stopped, true);
    assert.deepStrictEqual(stops, [false, false, false, true]);
    assert.deepStrictEqual(
      sections.map(({ lines, kept }) => [lines, kept]),
      [
        [12_500, true],
        [12_500, true],
        [1, false],
      ],
    );
  });

  test('keeps a patch of up to 16 MB, stopping at the file that takes it past them and leaving that file out uncounted, as a minified file counts as one line however long', () => {
    const small = section('a.ts', 1);
    const header = 'diff --git a/min.js b/min.js\n@@ -0,0 +1 @@\n+';
    const minified = (patchBytes: number) =>
      `${header}${'x'.repeat(patchBytes - small.length - header.length - 1)}\n`;
    const within = read([small, minified(16 * 1024 * 1024)]);
    assert.strictEqual(within.stopped, false);
    assert.deepStrictEqual(within.sections, [
      { header: 'diff --git a/a.ts b/a.ts', lines: 1, kept: true },
      { header: 'diff --git a/min.js b/min.js', lines: 1, kept: true },
    ]);
    const budget = new PatchBudget();
    budget.add(Buffer.from(small));
    assert.strictEqual(
      budget.add(Buffer.from(minified(16 * 1024 * 1024 + 1))),
      true,
    );
    assert.deepStrictEqual(budget.end().sections, [
      { header: 'diff --git a/a.ts b/a.ts', lines: 1, kept: true },
      { header: 'diff --git a/min.js b/min.js', lines: undefined, kept: false },
    ]);
  });

  test('counts the bytes of the files left out for their lines toward the 16 MB, as git still sends them, so many of them stop the read before git sends them all', () => {
    const large = (index: number) =>
      section(numbered(index), collapseThreshold + 1);
    const count = Math.ceil(patchByteBudget / large(0).length);
    const budget = new PatchBudget();
    let stoppedAt: number | undefined;
    for (let index = 0; index < count + 1; index++) {
      if (budget.add(Buffer.from(large(index)))) {
        stoppedAt ??= index;
      }
    }
    budget.add(Buffer.from(section('a.ts', 1)));
    const { sections, stopped } = budget.end();
    assert.strictEqual(stopped, true);
    assert.strictEqual(stoppedAt, count - 1);
    assert.deepStrictEqual(sections.at(-1), {
      header: `diff --git a/${numbered(count - 1)} b/${numbered(count - 1)}`,
      lines: undefined,
      kept: false,
    });
    assert.strictEqual(sections.length, count);
  });

  test(
    'counts the bytes git sends rather than their characters, from output split anywhere',
    { timeout: 20_000 },
    () => {
      const header = 'diff --git a/zh.txt b/zh.txt\n@@ -0,0 +1 @@\n+';
      const wide = Buffer.from(
        header + '中'.repeat(Math.ceil(patchByteBudget / 3)),
      );
      for (const end of ['', '\n']) {
        const output = Buffer.concat([wide, Buffer.from(end)]);
        for (const split of [header.length + 1, output.length - 1]) {
          const budget = new PatchBudget();
          budget.add(output.subarray(0, split));
          budget.add(output.subarray(split));
          assert.deepStrictEqual(budget.end().sections, [
            {
              header: 'diff --git a/zh.txt b/zh.txt',
              lines: undefined,
              kept: false,
            },
          ]);
        }
      }
      const undecodable = new PatchBudget();
      undecodable.add(
        Buffer.from('diff --git a/latin1.txt b/latin1.txt\n@@ -0,0 +1 @@\n+'),
      );
      undecodable.add(Buffer.alloc(patchByteBudget / 2, 0xe9));
      assert.deepStrictEqual(undecodable.end().sections, [
        {
          header: 'diff --git a/latin1.txt b/latin1.txt',
          lines: 1,
          kept: true,
        },
      ]);
    },
  );

  test('reads a long line git sends in many chunks in one pass over it', () => {
    const line = Buffer.alloc(patchByteBudget - 1024, 'x');
    const header = Buffer.from(
      'diff --git a/min.js b/min.js\n@@ -0,0 +1 @@\n+',
    );
    const readLine = (chunkSize: number) => {
      const budget = new PatchBudget();
      const started = performance.now();
      budget.add(header);
      for (let at = 0; at < line.length; at += chunkSize) {
        budget.add(line.subarray(at, at + chunkSize));
      }
      budget.add(Buffer.from('\n'));
      const budgeted = budget.end();
      return { ...budgeted, took: performance.now() - started };
    };
    const fastest = (chunkSize: number) =>
      Math.min(...[1, 2, 3].map(() => readLine(chunkSize).took));
    const { patch, sections } = readLine(65536);
    assert.strictEqual(patch.length, 45 + line.length);
    assert.deepStrictEqual(sections, [
      { header: 'diff --git a/min.js b/min.js', lines: 1, kept: true },
    ]);
    const inOneChunk = fastest(line.length);
    const inManyChunks = fastest(65536);
    assert.ok(
      inManyChunks < inOneChunk * 8 + 50,
      `${inManyChunks} ms in 64 KB chunks against ${inOneChunk} ms in one`,
    );
  });
});

suite('Files left out of a patch', () => {
  const files: FileChange[] = [
    fileChange('a.ts'),
    fileChange('spaces only.ts'),
    { ...fileChange('new.ts'), status: 'R', oldPath: 'old.ts' },
    fileChange('large.json'),
    fileChange('b.ts'),
    fileChange('c.ts'),
  ];

  test('names the files whose sections were left out, matching each section to its file by its header, past files with none, as whitespace-only ones', () => {
    const output =
      section('a.ts', 1) +
      section('new.ts', 1, 'old.ts') +
      section('large.json', collapseThreshold + 1) +
      section('b.ts', 1) +
      section('c.ts', 1);
    assert.deepStrictEqual(leftOutOf(read([output]), files), [
      { path: 'large.json', lines: collapseThreshold + 1 },
    ]);
  });

  test('leaves out every file after the one the patch stopped at, uncounted', () => {
    const budget = new PatchBudget();
    budget.add(Buffer.from(section('a.ts', 1)));
    budget.add(
      Buffer.from(
        `diff --git a/old.ts b/new.ts\n@@ -0,0 +1 @@\n+${'x'.repeat(patchByteBudget)}`,
      ),
    );
    assert.deepStrictEqual(leftOutOf(budget.end(), files), [
      { path: 'new.ts', lines: undefined },
      { path: 'large.json', lines: 0 },
      { path: 'b.ts', lines: 0 },
      { path: 'c.ts', lines: 0 },
    ]);
  });

  test('leaves out more files after the one the patch stopped at than a call can take arguments', () => {
    const many = Array.from({ length: 200_000 }, (_, i) =>
      fileChange(`${i}.ts`),
    );
    const budget = new PatchBudget();
    budget.add(
      Buffer.from(
        `diff --git a/0.ts b/0.ts\n@@ -0,0 +1 @@\n+${'x'.repeat(patchByteBudget)}`,
      ),
    );
    assert.strictEqual(leftOutOf(budget.end(), many).length, 200_000);
  });

  test('takes both sections of a type change, the old file deleted and the new one added under the same header, for one file, counting the lines of both', () => {
    const typeChanged = [
      fileChange('a.ts'),
      fileChange('link', { status: 'T' }),
      fileChange('b.ts'),
    ];
    const symlink = section('link', 1);
    const large = section('link', collapseThreshold);
    for (const halves of [symlink + large, large + symlink]) {
      const output = section('a.ts', 1) + halves + section('b.ts', 1);
      const read2 = read([output]);
      assert.strictEqual(read2.patch, section('a.ts', 1) + section('b.ts', 1));
      assert.deepStrictEqual(leftOutOf(read2, typeChanged), [
        { path: 'link', lines: collapseThreshold + 1 },
      ]);
    }
    const budget = new PatchBudget();
    budget.add(
      Buffer.from(
        `${section('a.ts', 1)}${symlink}diff --git a/link b/link\n@@ -0,0 +1 @@\n+${'x'.repeat(patchByteBudget)}`,
      ),
    );
    assert.deepStrictEqual(leftOutOf(budget.end(), typeChanged), [
      { path: 'link', lines: undefined },
      { path: 'b.ts', lines: 0 },
    ]);
  });
});
