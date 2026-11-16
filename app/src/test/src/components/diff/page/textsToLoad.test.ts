import * as assert from 'node:assert';
import { createElement, Fragment, useLayoutEffect } from 'react';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../components/diff/page/diff';
import type { LoadedText } from '../../../../../components/diff/page/sideTexts';
import type { TextRequest } from '../../../../../tools/git/shared/protocol';
import {
  textsToLoad,
  useTextsToLoad,
} from '../../../../../components/diff/page/textsToLoad';
import {
  inPage,
  blobs,
  loadedTexts,
  gappedPatch,
  addedPatch,
  farFiles,
} from '../../../tools/git/page/syntaxFixtures';

const farRequests = (open?: ReadonlySet<number>) =>
  textsToLoad(farFiles, 1, new Set(), open).map(
    ({ path, side }) => `${side}:${path}`,
  );

const requestsAfter = (count: number) =>
  textsToLoad(
    [
      ...parsePatch(
        [
          'diff --git a/added.ts b/added.ts',
          'new file mode 100644',
          'index 0000000000000000000000000000000000000000..3333333333333333333333333333333333333333',
          '--- /dev/null',
          '+++ b/added.ts',
          `@@ -0,0 +1,${count} @@`,
          ...Array.from({ length: count }, () => '+x;'),
          '',
        ].join('\n'),
      ),
      ...farFiles,
    ],
    1,
    new Set(),
  ).map(({ path, side }) => `${side}:${path}`);

suite('Syntax', () => {
  test('asks for the whole texts of a diff in the commit that shows it, before the window paints, rather than after, so they come a frame sooner', async () => {
    const files = parsePatch(gappedPatch);
    const asked: TextRequest[][] = [];
    let askedBeforePaint: boolean | undefined;
    const texts = new Map<string, LoadedText>();
    const open = new Set([0]);
    const ask = (load: TextRequest[]) => asked.push(load);
    function Asking() {
      useTextsToLoad(files, undefined, 1, open, texts, undefined, ask);
      return null;
    }
    function Painted() {
      useLayoutEffect(() => {
        askedBeforePaint = asked.length > 0;
      }, []);
      return null;
    }
    await inPage(async (render) => {
      await render(
        createElement(
          Fragment,
          null,
          createElement(Asking),
          createElement(Painted),
        ),
      );
    });
    assert.strictEqual(askedBeforePaint, true);
    assert.deepStrictEqual(asked, [
      [
        { path: 'a.ts', side: 'old', blob: blobs.old },
        { path: 'a.ts', side: 'new', blob: blobs.new },
      ],
    ]);
  });

  test('asks for the whole text of each side with lines hidden before a hunk, once a diff', () => {
    const requested = new Set<string>();
    const files = parsePatch(gappedPatch);
    assert.deepStrictEqual(textsToLoad(files, 1, requested), [
      { path: 'a.ts', side: 'old', blob: '1'.repeat(40) },
      { path: 'a.ts', side: 'new', blob: '2'.repeat(40) },
    ]);
    assert.deepStrictEqual(textsToLoad(files, 1, requested), []);
    assert.strictEqual(textsToLoad(files, 2, requested).length, 2);
  });

  test('forgets the whole texts asked for by the diffs before, as a diff refreshed for hours kept every one', () => {
    const requested = new Set<string>();
    const files = parsePatch(gappedPatch);
    for (const diff of [1, 2, 3]) {
      textsToLoad(files, diff, requested);
    }
    assert.deepStrictEqual([...requested], ['3:old:a.ts', '3:new:a.ts']);
  });

  test('asks a diff drawn anew only for the whole texts of the sides whose blob changed', () => {
    const texts = loadedTexts([['old:a.ts', 'old text']]).set('new:a.ts', {
      blob: '3'.repeat(40),
      text: 'new text',
    });
    assert.deepStrictEqual(
      textsToLoad(parsePatch(gappedPatch), 2, new Set(), undefined, texts),
      [{ path: 'a.ts', side: 'new', blob: blobs.new }],
    );
  });

  test('asks for no text of a side shown from its first line on, of a side a file lacks, or of a file it cannot color', () => {
    const files = parsePatch(
      [
        'diff --git a/a.ts b/a.ts',
        'new file mode 100644',
        'index 0000000000000000000000000000000000000000..2222222222222222222222222222222222222222',
        '--- /dev/null',
        '+++ b/a.ts',
        '@@ -0,0 +1,2 @@',
        '+let a;',
        '+let b;',
        'diff --git a/b.ts b/b.ts',
        'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
        '--- a/b.ts',
        '+++ b/b.ts',
        '@@ -1,2 +1,3 @@',
        ' let a;',
        '+let b;',
        ' let c;',
        '@@ -5 +6 @@',
        '-let d;',
        '+let e;',
        'diff --git a/notes.unknown b/notes.unknown',
        'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
        '@@ -5 +5 @@',
        '-a',
        '+b',
        '',
      ].join('\n'),
    );
    assert.deepStrictEqual(textsToLoad(files, 1, new Set()), [
      { path: 'b.ts', side: 'old', blob: '1'.repeat(40) },
      { path: 'b.ts', side: 'new', blob: '2'.repeat(40) },
    ]);
    assert.deepStrictEqual(textsToLoad(files.slice(0, 1), 1, new Set()), []);
  });

  test('asks for no text of a side that owns none of the lines shown, or with lines shown too far into it', () => {
    assert.deepStrictEqual(textsToLoad(parsePatch(addedPatch), 1, new Set()), [
      { path: 'a.ts', side: 'new', blob: '2'.repeat(40) },
    ]);
    const farPatch = [
      'diff --git a/a.ts b/a.ts',
      'index 1111111111111111111111111111111111111111..2222222222222222222222222222222222222222 100644',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -3,1 +3,1 @@',
      '-old = 1;',
      '+new = 2;',
      '@@ -5001,1 +5001,1 @@',
      '-old = 1;',
      '+new = 2;',
      '',
    ].join('\n');
    assert.deepStrictEqual(textsToLoad(parsePatch(farPatch), 1, new Set()), []);
  });

  test('asks for the whole texts of open files only, as long as the sides before take less than 20000 lines', () => {
    assert.deepStrictEqual(farRequests(), [
      'old:a.ts',
      'new:a.ts',
      'old:b.ts',
      'new:b.ts',
    ]);
    assert.deepStrictEqual(farRequests(new Set([2])), ['old:c.ts', 'new:c.ts']);
  });

  test('asks for whole texts only until the sides before take 20000 lines, counting a side colored from its hunks alone by its lines shown up to the 5000 it colors, as each whole text is read in full and tokenized up to its last line shown', () => {
    assert.deepStrictEqual(requestsAfter(4999), [
      'old:a.ts',
      'new:a.ts',
      'old:b.ts',
      'new:b.ts',
    ]);
    assert.deepStrictEqual(requestsAfter(5000), [
      'old:a.ts',
      'new:a.ts',
      'old:b.ts',
    ]);
    assert.deepStrictEqual(requestsAfter(20_000), requestsAfter(5000));
  });
});
