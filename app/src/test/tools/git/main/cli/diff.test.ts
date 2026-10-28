import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  blobsToSize,
  leftOutOf,
  newSideUnchanged,
  parseChanges,
  parseRawChanges,
  PatchBudget,
  pathspecs,
  whitespaceOnlyChanges,
  withoutFilesInside,
} from '../../../../../tools/git/main/cli/diff';
import {
  collapseThreshold,
  patchByteBudget,
  type FileChange,
} from '../../../../../tools/git/shared/protocol';
import { fileChange } from '../../../../fixtures';

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

suite('Whitespace ignored', () => {
  test('names the modified files a patch ignoring whitespace has no section for, but no untracked or other file it lacks', () => {
    const patch = section('a.ts', 1) + section('new.ts', 1, 'old.ts');
    assert.deepStrictEqual(
      whitespaceOnlyChanges(patch, [
        fileChange('a.ts'),
        fileChange('b.ts'),
        fileChange('new.ts', { status: 'R', oldPath: 'old.ts' }),
        fileChange('new.txt', { status: 'U' }),
        fileChange('gone.ts', { status: 'D' }),
        fileChange('c d.ts'),
      ]),
      ['b.ts', 'c d.ts'],
    );
    assert.deepStrictEqual(
      whitespaceOnlyChanges('diff --git a/c d.ts b/c d.ts', [
        fileChange('c d.ts'),
      ]),
      [],
    );
    assert.deepStrictEqual(whitespaceOnlyChanges('', [fileChange('a.ts')]), [
      'a.ts',
    ]);
  });

  test('turns the patch of a whole file into its new lines unchanged, keeping the mark of a missing newline only on them', () => {
    const header = [
      'diff --git a/a.ts b/a.ts',
      'index 1111111..2222222 100644',
      '--- a/a.ts',
      '+++ b/a.ts',
    ];
    const patch = (...lines: string[]) =>
      [...header, '@@ -1,3 +1,3 @@', ...lines, ''].join('\n');
    assert.strictEqual(
      newSideUnchanged(
        patch(
          ' first',
          '-second',
          '+  second',
          '-last',
          '\\ No newline at end of file',
          '+last',
        ),
      ),
      [...header, '@@ -1,3 +1,3 @@', ' first', '   second', ' last', ''].join(
        '\n',
      ),
    );
    assert.strictEqual(
      newSideUnchanged(
        patch('-only', '+only\r', '\\ No newline at end of file'),
      ),
      [
        ...header,
        '@@ -1 +1 @@',
        ' only\r',
        '\\ No newline at end of file',
        '',
      ].join('\n'),
    );
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

  test('drops the files inside a folder named like the file, whether git quotes their names or not', () => {
    const inside = section('dist/main.js', 1);
    const quoted = [
      'diff --git "a/dist/a\\"b.js" "b/dist/a\\"b.js"',
      'deleted file mode 100644',
      '',
    ].join('\n');
    const file = section('dist', 1);
    assert.strictEqual(
      withoutFilesInside(inside + quoted + file, { path: 'dist' }),
      file,
    );
  });

  test('keeps the file renamed from inside the folder it replaced', () => {
    const renamed = section('dist', 1, 'dist/main.js');
    const inside = section('dist/other.js', 1);
    assert.strictEqual(
      withoutFilesInside(renamed + inside, {
        path: 'dist',
        oldPath: 'dist/main.js',
      }),
      renamed,
    );
  });
});

function raw(status: string): string {
  return `:100644 100644 1111111 2222222 ${status}`;
}

const blob = (digit: string) => digit.repeat(40);

suite('Sizes of the changed files', () => {
  test('sizes the blobs of the files with changed lines, not the commit a submodule points to, which a partial clone would try to fetch', () => {
    const changes = parseRawChanges(
      [
        `:100644 100644 ${blob('1')} ${blob('2')} M`,
        'a.ts',
        `:160000 160000 ${blob('3')} ${blob('4')} M`,
        'lib',
        `:000000 100644 ${blob('0')} ${blob('5')} A`,
        'new.ts',
        `:100644 160000 ${blob('6')} ${blob('7')} T`,
        'vendor',
        '1\t1\ta.ts',
        '2\t2\tlib',
        '1\t0\tnew.ts',
        '1\t1\tvendor',
        '',
      ].join('\0'),
    );
    assert.deepStrictEqual(blobsToSize(changes), [
      blob('1'),
      blob('2'),
      blob('5'),
      blob('6'),
    ]);
  });
});

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

  test('marks a symbolic link by the mode git gives it, a deleted one by the mode it had, and a type change by the mode it ends with', () => {
    const none = blob('0');
    const changes = parseChanges(
      [
        `:000000 120000 ${none} ${blob('1')} A`,
        'added',
        `:120000 000000 ${blob('1')} ${none} D`,
        'deleted',
        `:120000 120000 ${blob('1')} ${blob('2')} M`,
        'retargeted',
        `:100644 120000 ${blob('1')} ${blob('2')} T`,
        'now a link',
        `:120000 100644 ${blob('1')} ${blob('2')} T`,
        'now a file',
        `:120000 120000 ${blob('1')} ${blob('1')} R100`,
        'old',
        'new',
        `:100644 100644 ${blob('1')} ${blob('2')} M`,
        'file',
        '',
      ].join('\0'),
    );
    assert.deepStrictEqual(
      changes.map((change) => [change.path, change.link]),
      [
        ['added', true],
        ['deleted', true],
        ['retargeted', true],
        ['now a link', true],
        ['now a file', undefined],
        ['new', true],
        ['file', undefined],
      ],
    );
    assert.ok(!('link' in changes[6]));
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
