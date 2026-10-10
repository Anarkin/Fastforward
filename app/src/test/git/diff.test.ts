import * as assert from 'node:assert';
import {
  leftOutOf,
  parseChanges,
  PatchBudget,
  pathspecs,
} from '../../git/diff';
import {
  collapseThreshold,
  patchByteBudget,
  patchLineBudget,
  type FileChange,
} from '../../shared/protocol';
import { fileChange } from '../fixtures';

function section(path: string, lines: number, oldPath = path): string {
  return [
    `diff --git a/${oldPath} b/${path}`,
    'index 1111111..2222222 100644',
    `--- a/${oldPath}`,
    `+++ b/${path}`,
    `@@ -1,${lines} +1,${lines} @@`,
    ' context',
    ...Array.from({ length: lines }, (_, index) =>
      index % 2 ? `+--- added ${index}` : `-+++ removed ${index}`,
    ),
    '\\ No newline at end of file',
    '',
  ].join('\n');
}

function read(chunks: readonly string[]) {
  const budget = new PatchBudget();
  for (const chunk of chunks) {
    budget.add(Buffer.from(chunk));
  }
  return budget.end();
}

suite('Patch budget', () => {
  test('keeps each file within the budget and leaves out one over 1500 changed lines with its count, counting only the changed lines of its hunks, from output split anywhere', () => {
    const output =
      section('a.ts', 2) +
      section('large.json', collapseThreshold + 1) +
      section('b.ts', 3);
    for (const split of [0, 10, output.indexOf('large.json') + 3, 2000]) {
      const read2 = read([output.slice(0, split), output.slice(split)]);
      assert.strictEqual(read2.patch, section('a.ts', 2) + section('b.ts', 3));
      assert.deepStrictEqual(read2.sections, [
        { header: 'diff --git a/a.ts b/a.ts', lines: 2, kept: true },
        {
          header: 'diff --git a/large.json b/large.json',
          lines: collapseThreshold + 1,
          kept: false,
        },
        { header: 'diff --git a/b.ts b/b.ts', lines: 3, kept: true },
      ]);
      assert.strictEqual(read2.stopped, false);
    }
  });

  test('leaves out the file that takes the patch past 20000 lines and stops there', () => {
    const crossing = Math.floor(patchLineBudget / collapseThreshold);
    const budget = new PatchBudget();
    let stoppedAt: number | undefined;
    for (let index = 0; index < crossing + 2; index++) {
      if (budget.add(Buffer.from(section(`${index}.txt`, collapseThreshold)))) {
        stoppedAt ??= index;
      }
    }
    const { sections, stopped } = budget.end();
    assert.strictEqual(stopped, true);
    assert.strictEqual(stoppedAt, crossing + 1);
    assert.deepStrictEqual(
      sections.map(({ kept }) => kept),
      [...Array.from({ length: crossing }, () => true), false],
    );
  });

  test('stops at a file of over 16 MB, leaving it out uncounted', () => {
    const budget = new PatchBudget();
    budget.add(Buffer.from(section('a.ts', 1)));
    const huge = `diff --git a/min.js b/min.js\n@@ -0,0 +1 @@\n+${'x'.repeat(patchByteBudget)}`;
    assert.strictEqual(budget.add(Buffer.from(huge)), true);
    assert.deepStrictEqual(budget.end().sections, [
      { header: 'diff --git a/a.ts b/a.ts', lines: 1, kept: true },
      { header: 'diff --git a/min.js b/min.js', lines: undefined, kept: false },
    ]);
  });

  test('counts the bytes git sends rather than their characters, from output split anywhere', () => {
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
      { header: 'diff --git a/latin1.txt b/latin1.txt', lines: 1, kept: true },
    ]);
  });

  test('reads a long line git sends in many chunks in one pass over it', () => {
    const line = Buffer.alloc(patchByteBudget - 1024, 'x');
    const budget = new PatchBudget();
    const started = performance.now();
    budget.add(Buffer.from('diff --git a/min.js b/min.js\n@@ -0,0 +1 @@\n+'));
    for (let at = 0; at < line.length; at += 65536) {
      budget.add(line.subarray(at, at + 65536));
    }
    budget.add(Buffer.from('\n'));
    const { patch, sections } = budget.end();
    assert.ok(performance.now() - started < 300);
    assert.strictEqual(patch.length, 45 + line.length);
    assert.deepStrictEqual(sections, [
      { header: 'diff --git a/min.js b/min.js', lines: 1, kept: true },
    ]);
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

suite('Pathspecs', () => {
  test('narrows to a path, or to the files given', () => {
    assert.deepStrictEqual(pathspecs({}), []);
    assert.deepStrictEqual(pathspecs({ path: 'a' }), ['--', 'a']);
    assert.deepStrictEqual(pathspecs({ path: 'b', oldPath: 'a' }), [
      '--',
      'a',
      'b',
    ]);
    assert.deepStrictEqual(pathspecs({ path: 'a*b', include: ['x'] }), [
      '--',
      'a*b',
    ]);
    assert.deepStrictEqual(pathspecs({ include: ['[ab].md'] }), [
      '--',
      '[ab].md',
    ]);
  });
});

function raw(status: string): string {
  return `:100644 100644 1111111 2222222 ${status}`;
}

suite('Git show parsers', () => {
  test('parses raw and numstat output with renames and binary files', () => {
    assert.deepStrictEqual(
      parseChanges(
        [
          raw('M'),
          'a.ts',
          raw('R087'),
          'old.ts',
          'new.ts',
          raw('A'),
          ':b.ts',
          raw('A'),
          '1\t1\timg.png',
          raw('A'),
          'two\nlines',
          '1\t2\ta.ts',
          '5\t0\ttwo\nlines',
          '3\t0\t',
          'old.ts',
          'new.ts',
          '1\t0\t:b.ts',
          '-\t-\t1\t1\timg.png',
          '',
        ].join('\0'),
      ),
      [
        {
          status: 'M',
          oldPath: undefined,
          path: 'a.ts',
          insertions: 1,
          deletions: 2,
        },
        {
          status: 'R',
          oldPath: 'old.ts',
          path: 'new.ts',
          insertions: 3,
          deletions: 0,
        },
        {
          status: 'A',
          oldPath: undefined,
          path: ':b.ts',
          insertions: 1,
          deletions: 0,
        },
        {
          status: 'A',
          oldPath: undefined,
          path: '1\t1\timg.png',
          insertions: 0,
          deletions: 0,
        },
        {
          status: 'A',
          oldPath: undefined,
          path: 'two\nlines',
          insertions: 5,
          deletions: 0,
        },
      ],
    );
  });

  test('keeps the object of a file moved or copied unchanged, which its patch leaves out', () => {
    const id = 'a'.repeat(40);
    const same = (status: string) => `:100644 100644 ${id} ${id} ${status}`;
    assert.deepStrictEqual(
      parseChanges(
        [
          same('R100'),
          'old.png',
          'new.png',
          same('C100'),
          'new.png',
          'copy.png',
          raw('R087'),
          'a.ts',
          'b.ts',
          '',
        ].join('\0'),
      ).map((change) => [change.path, change.id]),
      [
        ['new.png', id],
        ['copy.png', id],
        ['b.ts', undefined],
      ],
    );
  });

  test('parses copies, type changes and unknown statuses', () => {
    assert.deepStrictEqual(
      parseChanges(
        [
          raw('C075'),
          'src.ts',
          'copy.ts',
          raw('T'),
          'link',
          raw('U'),
          'odd',
          raw('M'),
          'after.ts',
          '2\t0\t',
          'src.ts',
          'copy.ts',
          '1\t1\tafter.ts',
          '',
        ].join('\0'),
      ),
      [
        {
          status: 'C',
          oldPath: 'src.ts',
          path: 'copy.ts',
          insertions: 2,
          deletions: 0,
        },
        {
          status: 'T',
          oldPath: undefined,
          path: 'link',
          insertions: 0,
          deletions: 0,
        },
        {
          status: '?',
          oldPath: undefined,
          path: 'odd',
          insertions: 0,
          deletions: 0,
        },
        {
          status: 'M',
          oldPath: undefined,
          path: 'after.ts',
          insertions: 1,
          deletions: 1,
        },
      ],
    );
  });
});
