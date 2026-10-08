import * as assert from 'node:assert';
import { parsePatch, textKey, type DiffFile } from '../../webview/diff';
import { diffRows } from '../../webview/diffView';
import {
  markdownSides,
  previewOf,
  previewTexts,
  wholePreviewOf,
} from '../../webview/previews';

const oldId = '1'.repeat(40);
const newId = '2'.repeat(40);
const none = '0'.repeat(40);

function textPatch(path: string, index: string): DiffFile {
  const [file] = parsePatch(
    [
      `diff --git a/${path} b/${path}`,
      `index ${index}`,
      `--- a/${path}`,
      `+++ b/${path}`,
      '@@ -1 +1 @@',
      '-# old',
      '+# new',
    ].join('\n'),
  );
  return file;
}

const kinds = (rows: ReturnType<typeof diffRows>) =>
  rows.map((row) => row.kind);

const readme = textPatch('README.md', `${oldId}..${newId}`);
const added = textPatch('docs/new.markdown', `${none}..${newId}`);

suite('Previews', () => {
  test('previews Markdown by its extension, and an SVG as an image', () => {
    assert.strictEqual(previewOf(readme), 'markdown');
    assert.strictEqual(previewOf(added), 'markdown');
    assert.strictEqual(
      previewOf(textPatch('v.svg', `${oldId}..${newId}`)),
      'image',
    );
    for (const file of [
      textPatch('notes.txt', `${oldId}..${newId}`),
      { ...readme, blobs: undefined },
      { ...readme, placeholder: { lines: 1 } },
      { ...readme, binary: true },
    ]) {
      assert.strictEqual(previewOf(file), undefined);
    }
    assert.strictEqual(
      wholePreviewOf({ path: 'a.MD', content: '# a', binary: false }),
      'markdown',
    );
    assert.strictEqual(
      wholePreviewOf({ path: 'a.md', content: '', binary: true }),
      undefined,
    );
  });

  test('asks once for the whole text of each side of the Markdown shown as a preview', () => {
    const requested = new Set<string>();
    const shown = new Set(['README.md', 'docs/new.markdown']);
    const files = [readme, added, textPatch('b.md', `${oldId}..${newId}`)];
    assert.deepStrictEqual(previewTexts(files, shown, 1, requested), [
      { path: 'README.md', side: 'old', blob: oldId },
      { path: 'README.md', side: 'new', blob: newId },
      { path: 'docs/new.markdown', side: 'new', blob: newId },
    ]);
    assert.deepStrictEqual(previewTexts(files, shown, 1, requested), []);
    assert.strictEqual(previewTexts(files, shown, 2, requested).length, 3);
  });

  test('previews both sides side by side, hatching one a file lacks, and the newest inline', () => {
    const texts = new Map([
      [textKey('README.md', 'old'), '# old'],
      [textKey('docs/new.markdown', 'new'), '# new'],
    ]);
    assert.deepStrictEqual(markdownSides(readme, texts, true), [
      { side: 'old', text: '# old', present: true },
      { side: 'new', text: undefined, present: true },
    ]);
    assert.deepStrictEqual(markdownSides(added, texts, true), [
      { side: 'old', text: undefined, present: false },
      { side: 'new', text: '# new', present: true },
    ]);
    assert.deepStrictEqual(markdownSides(added, texts, false), [
      { side: 'new', text: '# new', present: true },
    ]);
    const deleted = textPatch('gone.md', `${oldId}..${none}`);
    assert.deepStrictEqual(
      markdownSides(deleted, texts, false).map(({ side }) => side),
      ['old'],
    );
  });

  test('loads the images of each side from where that side of the document is, at its revision', () => {
    const commit = 'c'.repeat(40);
    const [renamed] = parsePatch(
      [
        'diff --git a/old/a.md b/new/a.md',
        'similarity index 90%',
        'rename from old/a.md',
        'rename to new/a.md',
        `index ${oldId}..${newId}`,
      ].join('\n'),
    );
    assert.deepStrictEqual(
      markdownSides(
        renamed,
        new Map(),
        true,
        { root: '/r', hash: commit },
        '3',
      ).map(({ images }) => images),
      [
        {
          root: '/r',
          document: 'old/a.md',
          revision: `${commit}^`,
          version: '3',
        },
        { root: '/r', document: 'new/a.md', revision: commit, version: '3' },
      ],
    );
  });

  test('shows Markdown as a preview in place of its lines once asked to, in a diff or whole', () => {
    const shown = new Set(['README.md']);
    assert.deepStrictEqual(
      kinds(diffRows([readme], new Map(), undefined, false, true, shown)),
      ['error', 'file', 'markdown'],
    );
    assert.ok(
      kinds(diffRows([readme], new Map(), undefined, false, true)).includes(
        'split',
      ),
    );
    const large = {
      ...readme,
      hunks: [
        {
          lines: Array.from({ length: 2000 }, (_, index) => ({
            kind: 'added' as const,
            oldNumber: undefined,
            newNumber: index + 1,
            text: `line ${index}`,
          })),
        },
      ],
    };
    assert.deepStrictEqual(
      kinds(diffRows([large], new Map(), undefined, false, true)),
      ['error', 'file', 'large'],
    );
    assert.deepStrictEqual(
      kinds(diffRows([large], new Map(), undefined, false, true, shown)),
      ['error', 'file', 'markdown'],
    );
    assert.deepStrictEqual(
      kinds(
        diffRows(
          [large],
          new Map([['README.md', false]]),
          undefined,
          false,
          true,
          shown,
        ),
      ),
      ['error', 'file'],
    );
    const whole = { path: 'README.md', content: '# a\n', binary: false };
    assert.deepStrictEqual(
      kinds(diffRows([], new Map(), whole, false, false, shown)),
      ['error', 'file', 'markdown'],
    );
  });
});
