import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { plainOf, strings } from '../../../../lib/shared/strings';
import { parsePatch, type DiffFile } from '../../../../tools/git/page/diff';
import { tagsWith } from '../../../fixtures';
import { kinds } from './diffViewFixtures';
import { diffRows, sideChange } from '../../../../tools/git/page/diffRows';
import { rowHeight, rowMeasures } from '../../../../tools/git/page/rowMeasures';
import { TextProbe } from '../../../../tools/git/page/textProbes';
import {
  FileNote,
  FileHeader,
  DiffSkeleton,
} from '../../../../tools/git/page/diffRowParts';

const binaryOfIndex = (index: string) =>
  parsePatch(
    [
      'diff --git a/a.bin b/a.bin',
      `index ${index}`,
      'Binary files a/a.bin and b/a.bin differ',
    ].join('\n'),
  )[0];

const changeOf = (index: string) => sideChange(binaryOfIndex(index));

const binaryMarkup = (
  change: 'added' | 'removed' | undefined,
  split: boolean,
) =>
  renderToStaticMarkup(
    <FileNote text="Binary file" change={change} split={split} />,
  );

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

  test('says a file is binary on each side it has, hatching the other side by side, and tints it inline', () => {
    assert.strictEqual(
      binaryMarkup('added', false),
      '<div class="file-note added">Binary file</div>',
    );
    assert.strictEqual(
      binaryMarkup('added', true),
      '<div class="split-line note-line"><div class="file-note split-side filler"></div><div class="file-note split-side added">Binary file</div></div>',
    );
    assert.strictEqual(
      binaryMarkup('removed', true),
      '<div class="split-line note-line"><div class="file-note split-side removed">Binary file</div><div class="file-note split-side filler"></div></div>',
    );
    assert.strictEqual(
      binaryMarkup(undefined, true),
      '<div class="split-line note-line"><div class="file-note split-side ">Binary file</div><div class="file-note split-side ">Binary file</div></div>',
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

const collapsibleHeader = (collapsible: boolean) =>
  renderToStaticMarkup(
    <FileHeader
      path="a.ts"
      open
      whole={false}
      collapsible={collapsible}
      onClick={() => {}}
    />,
  );

suite('Diff file header', () => {
  test('labels a file shown entire as unchanged, naming no commit, as it may be in the uncommitted changes or a comparison', () => {
    const html = renderToStaticMarkup(
      <FileHeader
        path="a.ts"
        open
        whole
        collapsible={false}
        onClick={() => {}}
      />,
    );
    assert.match(html, /<span class="unchanged">Unchanged<\/span>/);
    assert.doesNotMatch(html, /commit/);
    assert.doesNotMatch(
      renderToStaticMarkup(
        <FileHeader
          path="a.ts"
          open
          whole={false}
          collapsible
          onClick={() => {}}
        />,
      ),
      /unchanged/,
    );
  });

  test('draws the twisty only on a header that can collapse', () => {
    assert.match(collapsibleHeader(true), /twisty/);
    assert.doesNotMatch(collapsibleHeader(false), /twisty/);
  });

  test('names a renamed file by both its paths, shortened as git does, with both in full in its tooltip', () => {
    const html = renderToStaticMarkup(
      <FileHeader
        path="elsewhere/to-folder.txt"
        oldPath="moved/to-folder.txt"
        open
        whole={false}
        collapsible
        onClick={() => {}}
      />,
    );
    assert.match(
      html,
      /<span class="path" title="moved\/to-folder\.txt → elsewhere\/to-folder\.txt">\{moved → elsewhere\}\/to-folder\.txt<\/span>/,
    );
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

  test('draws the placeholder of a diff loading side by side as two columns of bars, each its own, and inline as one', () => {
    const split = renderToStaticMarkup(<DiffSkeleton split rows={9} />);
    const sides = tagsWith(split, 'split-side');
    assert.strictEqual(sides.length, 2);
    assert.strictEqual(tagsWith(split, 'skeleton-row').length, 18);
    const inline = renderToStaticMarkup(
      <DiffSkeleton split={false} rows={9} />,
    );
    assert.strictEqual(tagsWith(inline, 'split-side').length, 0);
    assert.strictEqual(tagsWith(inline, 'skeleton-row').length, 9);
  });

  test('makes every row a whole number of code lines tall, so the diff scrolls by whole lines, an empty one none', () => {
    const line = 16.8;
    assert.strictEqual(rowHeight({ kind: 'hunk', file: 0 }, false, line), line);
    assert.strictEqual(
      rowHeight({ kind: 'binary', file: 0 }, false, line),
      line,
    );
    assert.strictEqual(
      rowHeight({ kind: 'image', file: 0 }, false, line),
      19 * line,
    );
    const measured = rowMeasures([{ kind: 'error' }], undefined, line, 1.25);
    const preview = measured.measureElement(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      {} as Element,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      { borderBoxSize: [{ blockSize: 400 }] } as unknown as ResizeObserverEntry,
    );
    assert.ok(Math.abs(preview - 24 * line) < 1e-6, String(preview));
    const nothing = measured.measureElement(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      {} as Element,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      { borderBoxSize: [{ blockSize: 0 }] } as unknown as ResizeObserverEntry,
    );
    assert.strictEqual(Math.abs(nothing), 0);
  });

  test('measures the height of a line of code as the diff is first drawn, not only once it is drawn again, so a diff shown anew, as on changing tabs, does not draw its rows first as tall as a guess', async () => {
    const dom = new JSDOM('<!doctype html><main></main>');
    const lineHeight = 17;
    dom.window.matchMedia = () =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      ({
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList;
    const globals = {
      window: dom.window,
      document: dom.window.document,
      devicePixelRatio: 1,
      getComputedStyle: (element: Element) =>
        Object.assign(Object.create(null), {
          lineHeight: element.classList.contains('diff-line')
            ? `${lineHeight}px`
            : 'normal',
          letterSpacing: 'normal',
        }),
      ResizeObserver: class {
        observe(): void {}
        disconnect(): void {}
      },
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    const saved = Object.fromEntries(
      Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
    );
    Object.assign(globalThis, globals);
    try {
      const { createRoot } = await import('react-dom/client');
      const main = dom.window.document.querySelector('main');
      assert.ok(main);
      const measured: number[] = [];
      const root = createRoot(main);
      await act(async () => {
        root.render(
          <TextProbe
            onMeasure={(_width, _font, _padding, _scale, line) =>
              measured.push(line)
            }
          />,
        );
      });
      assert.deepStrictEqual(measured, [lineHeight]);
      await act(async () => {
        root.unmount();
      });
    } finally {
      Object.assign(globalThis, saved);
    }
  });
});
