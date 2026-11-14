import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { parsePatch, type DiffFile } from '../../../../tools/git/page/diff';
import { collapseThreshold } from '../../../../tools/git/shared/protocol';
import { ImageDiff, imagePanes } from '../../../../tools/git/page/imagePreview';
import { sideBySideWords } from '../../../../tools/git/page/pairing';
import { wordRanges } from '../../../../tools/git/page/wordDiff';
import { lineKey } from '../../../../tools/git/page/find';
import { noop } from '../../../fixtures';
import { withStores } from '../../../componentFixtures';
import { createGitStore } from '../../../../tools/git/page/store';
import { patch, kinds } from './diffViewFixtures';
import {
  diffRows,
  showsSideBySide,
  splitPairs,
  type DiffRow,
} from '../../../../tools/git/page/diffRows';
import { rowHeight } from '../../../../tools/git/page/rowMeasures';
import {
  scrollOnToggle,
  stuckHeader,
} from '../../../../tools/git/page/diffScrolling';
import { DiffView } from '../../../../tools/git/page/diffView';
import { gapWidth } from '../../../../tools/git/page/textProbes';

const binaryOf = (path: string) =>
  parsePatch(
    [
      `diff --git a/${path} b/${path}`,
      'index 1111111..2222222 100644',
      `Binary files a/${path} and b/${path} differ`,
    ].join('\n'),
  )[0];

const headers = (rows: ReturnType<typeof diffRows>) =>
  rows.flatMap((row) => (row.kind === 'file' ? [row.collapsible] : []));

function budgetedFiles() {
  const lineCount = 150;
  const wordCount = 20;
  const line = (name: string) =>
    Array.from({ length: wordCount }, (_, word) => `${name}w${word}`).join(' ');
  const removed = Array.from({ length: lineCount }, (_, index) =>
    line(`l${index}`),
  );
  const added = [line('inserted'), ...removed];
  const files = parsePatch(
    Array.from({ length: 8 }, (_, file) =>
      [
        `diff --git a/${file}.txt b/${file}.txt`,
        `--- a/${file}.txt`,
        `+++ b/${file}.txt`,
        `@@ -1,${removed.length} +1,${added.length} @@`,
        ...removed.map((text) => `-${text}`),
        ...added.map((text) => `+${text}`),
      ].join('\n'),
    ).join('\n'),
  );
  const perChange =
    removed.length * wordCount * added.length +
    added.length * wordCount * removed.length;
  return { files, aligned: Math.floor(sideBySideWords / perChange) };
}

function filesStartingAligned(
  files: readonly DiffFile[],
  rows: readonly DiffRow[],
): boolean[] {
  return files.map((_, file) => {
    const first = rows.find((row) => row.kind === 'split' && row.file === file);
    return first?.kind === 'split' && first.left === undefined;
  });
}

suite('A diff shown anew', () => {
  test('starts from the text measured for the diff shown before, so the rows it draws are not styled again once it measures its text alike', () => {
    const git = createGitStore(noop, {
      diffText: {
        charWidth: 7,
        font: '12px mono',
        spacing: 0,
        scale: 1.25,
        lineHeight: 18,
        padding: { top: 0.8, bottom: 0.8 },
      },
    });
    const html = renderToStaticMarkup(
      withStores(
        <DiffView
          error={null}
          files={[]}
          whole={undefined}
          origin={undefined}
          loading={false}
          diff={1}
          onLoad={noop}
          texts={new Map()}
          onLoadTexts={noop}
          changeMarks
          matches={[]}
          current={0}
          jump={0}
          firstChange={undefined}
        />,
        { git },
      ),
    );
    assert.match(html, /--diff-word-padding-top:0.8px/);
    assert.ok(
      html.includes(`--diff-gap-width:${gapWidth(1.25)}px`),
      'the gap of the scale measured',
    );
  });
});

suite('Diff rows', () => {
  test('lines up the changes of a side by side diff by their words only until comparing them passes a limit for the whole diff, pairing the rest in order, as side by side pairs every block before the diff is drawn', () => {
    const { files, aligned } = budgetedFiles();
    const rows = diffRows(files, new Map(), undefined, false, true);
    assert.ok(aligned > 0 && aligned < 8);
    assert.deepStrictEqual(
      filesStartingAligned(files, rows),
      Array.from({ length: 8 }, (_, file) => file < aligned),
    );
  });

  test('lays a side by side diff out the same each time, counting the changes lined up before toward the limit, so laying it out again, as for a file toggled, moves no rows', () => {
    const { files, aligned } = budgetedFiles();
    const expected = Array.from({ length: 8 }, (_, file) => file < aligned);
    const first = diffRows(files, new Map(), undefined, false, true);
    const again = diffRows(files, new Map(), undefined, false, true);
    const toggled = diffRows(
      files,
      new Map([[files[0].path, true]]),
      undefined,
      false,
      true,
    );
    assert.deepStrictEqual(filesStartingAligned(files, first), expected);
    assert.deepStrictEqual(filesStartingAligned(files, again), expected);
    assert.deepStrictEqual(filesStartingAligned(files, toggled), expected);
  });

  test('lays a side by side diff out by the limit after its words were marked, and marks them as the lines it lays out are paired', () => {
    const { files, aligned } = budgetedFiles();
    const last = files.length - 1;
    const words = wordRanges(files);
    words.get(lineKey(last, 0));
    const rows = diffRows(files, new Map(), undefined, false, true);
    assert.deepStrictEqual(
      filesStartingAligned(files, rows),
      Array.from({ length: 8 }, (_, file) => file < aligned),
    );
    const wordsLaidOut = wordRanges(files, splitPairs(rows));
    const [firstRow] = rows.filter(
      (row) => row.kind === 'split' && row.file === last,
    );
    assert.ok(firstRow?.kind === 'split' && firstRow.left && firstRow.right);
    assert.strictEqual(firstRow.right.line.text.startsWith('inserted'), true);
    assert.strictEqual(
      wordsLaidOut.get(lineKey(last, firstRow.left.index)),
      'whole',
    );
    assert.strictEqual(
      wordsLaidOut.get(lineKey(last, firstRow.right.index)),
      'whole',
    );
  });

  test('lays a file shown entire out inline, even with the side by side layout chosen', () => {
    const whole = { path: 'a.ts', content: 'a', binary: false };
    assert.strictEqual(showsSideBySide(true, undefined), true);
    assert.strictEqual(showsSideBySide(true, whole), false);
    assert.strictEqual(showsSideBySide(false, undefined), false);
  });

  test('lays out a small file whole', () => {
    const files = parsePatch(patch('a.ts', 2));
    assert.deepStrictEqual(kinds(diffRows(files, new Map(), undefined)), [
      'error',
      'file',
      'line',
      'line',
    ]);
  });

  test('divides the changed parts of a file with a plain line, leaving out the function git guesses they are in', () => {
    const files = parsePatch(
      [patch('a.ts', 1), '@@ -10,0 +11,1 @@ function f()', '+line'].join('\n'),
    );
    const rows = diffRows(files, new Map(), undefined);
    assert.deepStrictEqual(kinds(rows), [
      'error',
      'file',
      'line',
      'hunk',
      'line',
    ]);
    assert.deepStrictEqual(rows[3], { kind: 'hunk', file: 0 });
  });

  test('collapses a large file, and opens it when asked', () => {
    const files = parsePatch(patch('graph.json', collapseThreshold + 1));
    const collapsed = diffRows(files, new Map(), undefined);
    assert.deepStrictEqual(kinds(collapsed), ['error', 'file', 'large']);
    assert.deepStrictEqual(collapsed[2], {
      kind: 'large',
      file: 0,
      path: 'graph.json',
      lines: collapseThreshold + 1,
    });

    const opened = diffRows(files, new Map([['graph.json', true]]), undefined);
    assert.strictEqual(opened.length, 2 + collapseThreshold + 1);

    const closed = diffRows(
      parsePatch(
        [patch('graph.json', collapseThreshold + 1), patch('a.ts', 1)].join(
          '\n',
        ),
      ),
      new Map([['graph.json', false]]),
      undefined,
    );
    assert.deepStrictEqual(kinds(closed), ['error', 'file', 'file', 'line']);
  });

  test('counts only changed lines toward collapsing a file', () => {
    const files = parsePatch(
      [patch('a.ts', collapseThreshold), ' one', ' two', ' three'].join('\n'),
    );
    assert.deepStrictEqual(kinds(diffRows(files, new Map(), undefined)), [
      'error',
      'file',
      ...Array<string>(collapseThreshold + 3).fill('line'),
    ]);
  });

  test('closes a small file when asked', () => {
    const files = parsePatch([patch('a.ts', 2), patch('b.ts', 1)].join('\n'));
    const rows = diffRows(files, new Map([['a.ts', false]]), undefined);
    assert.deepStrictEqual(kinds(rows), ['error', 'file', 'file', 'line']);
  });

  test('lets a file collapse only among others, as a file shown alone has nothing to make room for', () => {
    const pair = parsePatch([patch('a.ts', 1), patch('b.ts', 1)].join('\n'));
    assert.deepStrictEqual(headers(diffRows(pair, new Map(), undefined)), [
      true,
      true,
    ]);
    assert.deepStrictEqual(
      headers(diffRows(pair.slice(0, 1), new Map(), undefined)),
      [false],
    );
    assert.deepStrictEqual(
      headers(
        diffRows([], new Map(), {
          path: 'README.md',
          content: 'a\n',
          binary: false,
        }),
      ),
      [false],
    );
  });

  test('keeps a file shown alone open though it was closed among others, as alone it has no way to open again', () => {
    const files = parsePatch(patch('a.ts', 2));
    assert.deepStrictEqual(
      kinds(diffRows(files, new Map([['a.ts', false]]), undefined)),
      ['error', 'file', 'line', 'line'],
    );
  });

  test('still offers to show a large file shown alone that was closed among others', () => {
    const files = parsePatch(patch('graph.json', collapseThreshold + 1));
    assert.deepStrictEqual(
      kinds(diffRows(files, new Map([['graph.json', false]]), undefined)),
      ['error', 'file', 'large'],
    );
  });

  test('lays out a whole file line by line', () => {
    const rows = diffRows([], new Map(), {
      path: 'README.md',
      content: 'one\ntwo\n',
      binary: false,
    });
    assert.deepStrictEqual(kinds(rows), [
      'error',
      'file',
      'wholeLine',
      'wholeLine',
    ]);
    const unterminated = diffRows([], new Map(), {
      path: 'README.md',
      content: 'one\ntwo',
      binary: false,
    });
    assert.deepStrictEqual(
      unterminated.map((row) => row.kind === 'wholeLine' && row.number),
      [false, false, 1, 2],
    );
  });

  test('lays out an empty whole file without lines', () => {
    const rows = diffRows([], new Map(), {
      path: '.gitkeep',
      content: '',
      binary: false,
    });
    assert.deepStrictEqual(kinds(rows), ['error', 'file']);
  });

  test('keeps what it shows while the next one loads, and shows a placeholder only in place of nothing', () => {
    assert.deepStrictEqual(
      kinds(diffRows(parsePatch(patch('a.ts', 1)), new Map(), undefined, true)),
      ['error', 'file', 'line'],
    );
    assert.deepStrictEqual(
      kinds(
        diffRows(
          [],
          new Map(),
          { path: 'a', content: 'x\n', binary: false },
          true,
        ),
      ),
      ['error', 'file', 'wholeLine'],
    );
  });

  test('stands in for a diff that loads, and a large file being fetched', () => {
    assert.deepStrictEqual(kinds(diffRows([], new Map(), undefined, true)), [
      'error',
      'skeleton',
    ]);
    const large = {
      path: 'graph.json',
      binary: false,
      hunks: [],
      placeholder: { lines: 5000 },
    };
    assert.deepStrictEqual(kinds(diffRows([large], new Map(), undefined)), [
      'error',
      'file',
      'large',
    ]);
    assert.deepStrictEqual(
      kinds(diffRows([large], new Map([['graph.json', true]]), undefined)),
      ['error', 'file', 'skeletonLines'],
    );
  });

  test('stands in for a diff that loads while only its files past the budget are known', () => {
    const large = {
      path: 'graph.json',
      binary: false,
      hunks: [],
      placeholder: { lines: 5000 },
    };
    assert.deepStrictEqual(
      kinds(diffRows([large], new Map(), undefined, true)),
      ['error', 'skeleton'],
    );
  });

  test('shows a binary file as such, whole or in a diff, and an image as one', () => {
    const whole = { path: 'a.bin', content: '', binary: true, id: 'a' };
    assert.deepStrictEqual(kinds(diffRows([], new Map(), whole)), [
      'error',
      'file',
      'binary',
    ]);
    assert.deepStrictEqual(
      kinds(diffRows([], new Map(), { ...whole, path: 'a.png' })),
      ['error', 'file', 'image'],
    );
    for (const sideBySide of [false, true]) {
      assert.deepStrictEqual(
        kinds(
          diffRows(
            [binaryOf('a.bin'), binaryOf('a.png')],
            new Map(),
            undefined,
            false,
            sideBySide,
          ),
        ),
        ['error', 'file', 'binary', 'file', 'image'],
      );
    }
    assert.strictEqual(rowHeight({ kind: 'image', file: 0 }), 19 * 22);
  });

  test('previews an image on both sides when side by side, hatching the side it lacks, and only on the sides it has inline', () => {
    const [added] = parsePatch(
      [
        'diff --git a/a.png b/a.png',
        'new file mode 100644',
        `index ${'0'.repeat(40)}..${'2'.repeat(40)}`,
        'Binary files /dev/null and b/a.png differ',
      ].join('\n'),
    );
    const origin = { root: '/repo', hash: 'c'.repeat(40) };
    const shown = (sideBySide: boolean) =>
      imagePanes(origin, added, sideBySide).map((pane) => [
        pane.side,
        pane.url !== undefined,
      ]);
    assert.deepStrictEqual(shown(false), [['new', true]]);
    assert.deepStrictEqual(shown(true), [
      ['old', false],
      ['new', true],
    ]);
    const markup = renderToStaticMarkup(
      <ImageDiff panes={imagePanes(origin, added, true)} />,
    );
    assert.match(
      markup,
      /<div class="image-pane filler"><div class="image-frame"><\/div><\/div>/,
    );
    assert.match(markup, /class="image-pane"/);
  });
});

function laidOut(rows: readonly DiffRow[]) {
  let start = 0;
  return rows.map((row, index) => {
    const item = { index, start, end: start + (rowHeight(row) ?? 100) };
    start = item.end;
    return item;
  });
}

suite('Stuck file header', () => {
  const files = parsePatch(`${patch('a.ts', 3)}\n${patch('b.ts', 3)}`);
  const rows = diffRows(files, new Map(), undefined);
  const items = laidOut(rows);
  const start = (index: number) => items[index].start;

  test('sticks the header of the file whose line is on top', () => {
    assert.deepStrictEqual(kinds(rows), [
      'error',
      'file',
      'line',
      'line',
      'line',
      'file',
      'line',
      'line',
      'line',
    ]);
    assert.strictEqual(stuckHeader(rows, items, start(7) + 1), rows[5]);
    assert.strictEqual(stuckHeader(rows, items, start(5) + 1), rows[5]);
  });

  test('sticks nothing while a header is whole in its place, or no file is on top', () => {
    assert.strictEqual(stuckHeader(rows, items, start(5)), undefined);
    assert.strictEqual(stuckHeader(rows, items, 0), undefined);
    assert.strictEqual(stuckHeader(rows, items, start(1)), undefined);
  });

  test('sticks the header of a whole file too', () => {
    const whole = diffRows([], new Map(), {
      path: 'README.md',
      content: 'a\nb\nc\n',
      binary: false,
    });
    const wholeItems = laidOut(whole);
    assert.strictEqual(
      stuckHeader(whole, wholeItems, wholeItems[3].start),
      whole[1],
    );
  });

  test('scrolls to the header of a file closed from its stuck header, and nowhere otherwise', () => {
    const closed = diffRows(files, new Map([['b.ts', false]]), undefined);
    const closedHeader = closed[5];
    const openHeader = rows[5];
    assert.ok(closedHeader.kind === 'file' && openHeader.kind === 'file');
    assert.strictEqual(scrollOnToggle(closed, closedHeader, true), 5);
    assert.strictEqual(scrollOnToggle(rows, openHeader, false), undefined);
  });
});
