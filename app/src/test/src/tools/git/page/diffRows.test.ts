import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainOf } from '../../../../../lib/shared/sentences';
import { strings } from '../../../../../lib/shared/strings';
import { parsePatch, type DiffFile } from '../../../../../tools/git/page/diff';
import { kinds } from './diffViewFixtures';
import { diffRows, sideChange } from '../../../../../tools/git/page/diffRows';
import { rowHeight } from '../../../../../tools/git/page/rowMeasures';

const binaryOfIndex = (index: string) =>
  parsePatch(
    [
      'diff --git a/a.bin b/a.bin',
      `index ${index}`,
      'Binary files a/a.bin and b/a.bin differ',
    ].join('\n'),
  )[0];

const changeOf = (index: string) => sideChange(binaryOfIndex(index));

const emptyFile = (index: string, mode: string) =>
  parsePatch(
    ['diff --git a/e.md b/e.md', mode, `index ${index}`].join('\n'),
  )[0];

suite('Binary files', () => {
  test('notes an empty file added or deleted, which has no lines to show, and the old and new mode of one only changed in mode', () => {
    const empty = 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391';
    for (const sideBySide of [false, true]) {
      assert.deepStrictEqual(
        kinds(
          diffRows(
            [emptyFile(`${'0'.repeat(40)}..${empty}`, 'new file mode 100644')],
            new Map(),
            undefined,
            false,
            sideBySide,
          ),
        ),
        ['error', 'file', 'empty'],
      );
    }
    assert.deepStrictEqual(
      kinds(
        diffRows(
          [
            emptyFile(
              `${empty}..${'0'.repeat(40)}`,
              'deleted file mode 100644',
            ),
          ],
          new Map(),
          undefined,
        ),
      ),
      ['error', 'file', 'empty'],
    );
    assert.deepStrictEqual(
      kinds(
        diffRows(
          [
            parsePatch(
              [
                'diff --git a/s.sh b/s.sh',
                'old mode 100644',
                'new mode 100755',
              ].join('\n'),
            )[0],
          ],
          new Map(),
          undefined,
        ),
      ),
      ['error', 'file', 'mode'],
    );
    assert.strictEqual(
      strings.diff.modeChanged('100644', '100755'),
      'Mode changed from 100644 to 100755',
    );
  });

  test('tells a binary file added or deleted by the side it lacks', () => {
    assert.strictEqual(
      changeOf(`${'0'.repeat(40)}..${'2'.repeat(40)}`),
      'added',
    );
    assert.strictEqual(
      changeOf(`${'1'.repeat(40)}..${'0'.repeat(40)}`),
      'removed',
    );
    assert.strictEqual(
      changeOf(`${'1'.repeat(40)}..${'2'.repeat(40)}`),
      undefined,
    );
  });
});

const linkPatch = (...patchLines: string[]) =>
  parsePatch(['diff --git a/l b/l', ...patchLines].join('\n'))[0];

const noNewline = '\\ No newline at end of file';

const linkRows = (file: DiffFile, sideBySide: boolean) =>
  diffRows([file], new Map(), undefined, false, sideBySide).flatMap((row) =>
    row.kind === 'link' ? [row.side] : [row.kind],
  );

const linkNotes = (file: DiffFile, sideBySide: boolean) =>
  diffRows([file], new Map(), undefined, false, sideBySide).slice(2);

suite('Symbolic links', () => {
  const added = linkPatch(
    'new file mode 120000',
    'index 0000000..1111111',
    '--- /dev/null',
    '+++ b/l',
    '@@ -0,0 +1 @@',
    '+README',
    noNewline,
  );
  const deleted = linkPatch(
    'deleted file mode 120000',
    'index 1111111..0000000',
    '--- a/l',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-README',
    noNewline,
  );
  const retargeted = linkPatch(
    'index 1111111..2222222 120000',
    '--- a/l',
    '+++ b/l',
    '@@ -1 +1 @@',
    '-README',
    noNewline,
    '+docs/README',
    noNewline,
  );
  const fileToLink = linkPatch(
    'deleted file mode 100644',
    'index 3333333..0000000',
    '--- a/l',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-hello',
    'diff --git a/l b/l',
    'new file mode 120000',
    'index 0000000..1111111',
    '--- /dev/null',
    '+++ b/l',
    '@@ -0,0 +1 @@',
    '+README',
    noNewline,
  );
  const [renamed] = parsePatch(
    [
      'diff --git a/l b/m',
      'similarity index 50%',
      'rename from l',
      'rename to m',
      'index 1111111..2222222 120000',
      '--- a/l',
      '+++ b/m',
      '@@ -1 +1 @@',
      '-README',
      noNewline,
      '+docs/README',
      noNewline,
    ].join('\n'),
  );

  test('notes the target of each side that is a symbolic link in place of its text, inline and side by side, above the lines of a side that is a file', () => {
    for (const sideBySide of [false, true]) {
      assert.deepStrictEqual(linkRows(added, sideBySide), [
        'error',
        'file',
        'new',
      ]);
      assert.deepStrictEqual(linkRows(deleted, sideBySide), [
        'error',
        'file',
        'old',
      ]);
      assert.deepStrictEqual(linkRows(retargeted, sideBySide), [
        'error',
        'file',
        'old',
        'new',
      ]);
      assert.deepStrictEqual(linkRows(fileToLink, sideBySide), [
        'error',
        'file',
        'new',
        sideBySide ? 'split' : 'line',
      ]);
      assert.deepStrictEqual(linkRows(renamed, sideBySide), [
        'error',
        'file',
        'old',
        'new',
      ]);
    }
    assert.strictEqual(
      plainOf(strings.diff.symbolicLink('docs/README')),
      'Symbolic link to "docs/README"',
    );
    assert.strictEqual(rowHeight({ kind: 'link', file: 0, side: 'new' }), 22);
  });

  test('notes the side of a file that changed type between a symbolic link and a binary or empty file, on its own side, inline and side by side', () => {
    const linkLines = [
      'deleted file mode 120000',
      'index 1111111..0000000',
      '--- a/l',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-README',
      noNewline,
      'diff --git a/l b/l',
      'new file mode 100644',
    ];
    const toLink = [
      'diff --git a/l b/l',
      'new file mode 120000',
      'index 0000000..1111111',
      '--- /dev/null',
      '+++ b/l',
      '@@ -0,0 +1 @@',
      '+README',
      noNewline,
    ];
    const linkToBinary = linkPatch(
      ...linkLines,
      'index 0000000..2222222',
      'Binary files /dev/null and b/l differ',
    );
    const linkToEmpty = linkPatch(...linkLines, 'index 0000000..e69de29');
    const binaryToLink = linkPatch(
      'deleted file mode 100644',
      'index 2222222..0000000',
      'Binary files a/l and /dev/null differ',
      ...toLink,
    );
    const emptyToLink = linkPatch(
      'deleted file mode 100644',
      'index e69de29..0000000',
      ...toLink,
    );
    for (const sideBySide of [false, true]) {
      assert.deepStrictEqual(linkNotes(linkToBinary, sideBySide), [
        { kind: 'link', file: 0, side: 'old' },
        { kind: 'binary', file: 0, change: 'added' },
      ]);
      assert.deepStrictEqual(linkNotes(linkToEmpty, sideBySide), [
        { kind: 'link', file: 0, side: 'old' },
        { kind: 'empty', file: 0, change: 'added' },
      ]);
      assert.deepStrictEqual(linkNotes(binaryToLink, sideBySide), [
        { kind: 'binary', file: 0, change: 'removed' },
        { kind: 'link', file: 0, side: 'new' },
      ]);
      assert.deepStrictEqual(linkNotes(emptyToLink, sideBySide), [
        { kind: 'empty', file: 0, change: 'removed' },
        { kind: 'link', file: 0, side: 'new' },
      ]);
    }
  });

  test('notes a symbolic link shown whole by its target, with no lines and no preview, though its name is that of a document', () => {
    const whole = {
      path: 'AGENTS.md',
      content: 'README',
      binary: false,
      link: true as const,
    };
    assert.deepStrictEqual(kinds(diffRows([], new Map(), whole)), [
      'error',
      'file',
      'link',
    ]);
  });
});

const renamedFile = (...patchLines: string[]) =>
  parsePatch(['diff --git a/p.sh b/q.sh', ...patchLines].join('\n'))[0];
suite('Renamed files', () => {
  const rename = [
    'similarity index 100%',
    'rename from p.sh',
    'rename to q.sh',
  ];

  test('notes a file renamed or copied without changes, which has no lines to show, keeping its old path on its header', () => {
    for (const sideBySide of [false, true]) {
      for (const file of [
        renamedFile(...rename),
        renamedFile('similarity index 100%', 'copy from p.sh', 'copy to q.sh'),
      ]) {
        const rows = diffRows([file], new Map(), undefined, false, sideBySide);
        assert.deepStrictEqual(kinds(rows), ['error', 'file', 'sameContent']);
        assert.deepStrictEqual(rows[1], {
          kind: 'file',
          file: 0,
          path: 'q.sh',
          oldPath: 'p.sh',
          open: true,
          collapsible: false,
        });
      }
    }
  });

  test('notes only whitespace changed for a renamed file git found less than wholly alike but shows no lines of, as whitespace changes are hidden', () => {
    assert.deepStrictEqual(
      kinds(
        diffRows(
          [
            renamedFile(
              'similarity index 83%',
              'rename from p.sh',
              'rename to q.sh',
              'index 1111111..2222222 100644',
            ),
          ],
          new Map(),
          undefined,
        ),
      ),
      ['error', 'file', 'whitespace'],
    );
  });

  test('notes the mode of a renamed file changing rather than its content staying, and no note for a rename with changed lines', () => {
    assert.deepStrictEqual(
      kinds(
        diffRows(
          [renamedFile('old mode 100644', 'new mode 100755', ...rename)],
          new Map(),
          undefined,
        ),
      ),
      ['error', 'file', 'mode'],
    );
    assert.deepStrictEqual(
      kinds(
        diffRows(
          [
            renamedFile(
              'similarity index 90%',
              'rename from p.sh',
              'rename to q.sh',
              'index 1111111..2222222 100644',
              '--- a/p.sh',
              '+++ b/q.sh',
              '@@ -1 +1 @@',
              '-a',
              '+b',
            ),
          ],
          new Map(),
          undefined,
        ),
      ),
      ['error', 'file', 'line', 'line'],
    );
  });
});
