import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parsePatch, type DiffFile } from '../webview/diff';
import { DiffFind, FindActions } from '../webview/diffColumn';
import {
  diffMinimapMarks,
  diffRows,
  findRangesByLine,
  highlighted,
  lineKeys,
} from '../webview/diffView';
import {
  findMatches,
  matchCount,
  matchesIn,
  stepMatch,
  unsearchedFiles,
  wholeLines,
} from '../webview/find';
import { matchMarks } from '../webview/minimap';
import { isFindShortcut } from '../webview/shortcuts';

const patch = [
  'diff --git a/a.ts b/a.ts',
  '--- a/a.ts',
  '+++ b/a.ts',
  '@@ -1,2 +1,2 @@',
  ' const Find = 1;',
  '-const find = 2;',
  '+const finder = 2;',
  '@@ -10,1 +10,1 @@',
  ' find(find);',
  'diff --git a/b.ts b/b.ts',
  '--- a/b.ts',
  '+++ b/b.ts',
  '@@ -1,1 +1,1 @@',
  '-nothing',
  '+FIND',
  '',
].join('\n');

const whole = { path: 'c.ts', content: 'find\nnone\n', binary: false };

function noop() {}

suite('Find in diff', () => {
  test('finds a match where it is, also after letters that lowercase longer', () => {
    assert.deepStrictEqual(matchesIn('İstanbul foo', 'foo'), [
      { start: 9, end: 12 },
    ]);
    assert.deepStrictEqual(matchesIn('İİ x İ', 'i̇'), [
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 5, end: 6 },
    ]);
    assert.deepStrictEqual(matchesIn('İ', 'i'), [{ start: 0, end: 1 }]);
  });

  test('finds a capital sigma by its lowercase, also at the end of a word', () => {
    assert.deepStrictEqual(matchesIn('ΟΔΟΣ ΟΔΟΣ', 'σ'), [
      { start: 3, end: 4 },
      { start: 8, end: 9 },
    ]);
    assert.deepStrictEqual(matchesIn('ΟΔΟΣ x', 'Σ x'), [{ start: 3, end: 6 }]);
  });

  test('finds every occurrence in a line, ignoring case, inside words too', () => {
    assert.deepStrictEqual(matchesIn('Find finder', 'find'), [
      { start: 0, end: 4 },
      { start: 5, end: 9 },
    ]);
    assert.deepStrictEqual(matchesIn('aaaa', 'aa'), [
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
    assert.deepStrictEqual(matchesIn('find', ''), []);
  });

  test('searches every line of every file, collapsed or not, numbering lines across hunks', () => {
    const files = parsePatch(patch);
    assert.deepStrictEqual(findMatches(files, undefined, 'finder'), [
      { file: 0, line: 2, start: 6, end: 12 },
    ]);
    assert.deepStrictEqual(
      findMatches(files, undefined, 'find').map((match) => [
        match.file,
        match.line,
      ]),
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 3],
        [1, 1],
      ],
    );
    assert.deepStrictEqual(findMatches(files, undefined, ''), []);
  });

  test('searches the whole of an unchanged file instead, when one is shown', () => {
    assert.deepStrictEqual(findMatches([], whole, 'find'), [
      { file: 0, line: 0, start: 0, end: 4 },
    ]);
    assert.deepStrictEqual(wholeLines(whole), ['find', 'none']);
    assert.deepStrictEqual(wholeLines({ ...whole, binary: true }), []);
    assert.deepStrictEqual(wholeLines({ ...whole, content: '' }), []);
  });

  test('counts the large files not loaded yet as not searched', () => {
    const files: DiffFile[] = [
      ...parsePatch(patch),
      { path: 'big.ts', binary: false, hunks: [], placeholder: { lines: 9 } },
    ];
    assert.strictEqual(unsearchedFiles(files, undefined), 1);
    assert.strictEqual(unsearchedFiles(files, whole), 0);
  });

  test('says which match is shown of how many, or that there are none', () => {
    assert.strictEqual(matchCount('', 0, 0), '');
    assert.strictEqual(matchCount('x', 0, 0), 'No results');
    assert.strictEqual(matchCount('x', 17, 2), '3 of 17');
  });

  test('steps to the next or previous match, wrapping around', () => {
    assert.strictEqual(stepMatch(0, 3, 1), 1);
    assert.strictEqual(stepMatch(2, 3, 1), 0);
    assert.strictEqual(stepMatch(0, 3, -1), 2);
    assert.strictEqual(stepMatch(0, 0, 1), 0);
  });

  test('keys each row by the file and line a match names, and only lines', () => {
    const files = parsePatch(patch);
    const rows = diffRows(files, new Map([['b.ts', false]]), undefined);
    assert.deepStrictEqual(lineKeys(rows), [
      [],
      [],
      ['0:0'],
      ['0:1'],
      ['0:2'],
      [],
      ['0:3'],
      [],
    ]);
    assert.deepStrictEqual(lineKeys(diffRows([], new Map(), whole)), [
      [],
      [],
      ['0:0'],
      ['0:1'],
    ]);
  });

  test('keys a side-by-side row by both of its lines, an unchanged one once', () => {
    const files = parsePatch(patch);
    const rows = diffRows(
      files,
      new Map([['b.ts', false]]),
      undefined,
      false,
      true,
    );
    assert.deepStrictEqual(lineKeys(rows), [
      [],
      [],
      ['0:0'],
      ['0:1', '0:2'],
      [],
      ['0:3'],
      [],
    ]);
  });

  test('groups the matches by their line, in order, even a great many on one line', () => {
    const files = parsePatch(patch);
    const byLine = findRangesByLine(findMatches(files, undefined, 'find'));
    assert.deepStrictEqual(
      [...byLine].map(([key, ranges]) => [
        key,
        ranges.map((range) => [range.start, range.end]),
      ]),
      [
        ['0:0', [[6, 10]]],
        ['0:1', [[6, 10]]],
        ['0:2', [[6, 10]]],
        [
          '0:3',
          [
            [0, 4],
            [5, 9],
          ],
        ],
        ['1:1', [[0, 4]]],
      ],
    );
    const many = findMatches(
      [],
      { ...whole, content: 'a'.repeat(50_000) },
      'a',
    );
    assert.strictEqual(findRangesByLine(many).get('0:0')?.length, 50_000);
  });

  test('marks the matches in a line, the current one apart', () => {
    const html = renderToStaticMarkup(
      <>
        {highlighted(
          'find a find',
          [
            { start: 0, end: 4 },
            { start: 7, end: 11 },
          ],
          { start: 7, end: 11 },
        )}
      </>,
    );
    assert.strictEqual(
      html,
      '<mark class="find-match ">find</mark> a <mark class="find-match current">find</mark>',
    );
    assert.strictEqual(highlighted('plain', [], undefined), 'plain');
  });

  test('marks the changes on the minimap only when asked, as for a file shown entire, but the matches always', () => {
    const rows = diffRows(parsePatch(patch), new Map(), undefined);
    const keys = lineKeys(rows);
    const matched = new Map([['0:3', []]]);
    const kinds = (changeMarks: boolean) =>
      diffMinimapMarks(rows, keys, matched, changeMarks).map(
        (mark) => mark.kind,
      );
    assert.deepStrictEqual(kinds(false), ['match']);
    assert.deepStrictEqual(kinds(true), [
      'removed',
      'added',
      'removed',
      'added',
      'match',
    ]);
  });

  test('ticks the minimap where the matched rows are', () => {
    const rows = [
      { height: 20, change: undefined },
      { height: 20, change: undefined },
      { height: 40, change: 'added' as const },
    ];
    assert.deepStrictEqual(matchMarks(rows, new Set([1, 2])), [
      { kind: 'match', top: 0.25, height: 0.25 },
      { kind: 'match', top: 0.5, height: 0.5 },
    ]);
    assert.deepStrictEqual(matchMarks([], new Set([0])), []);
  });

  test('opens on Ctrl+F, or Cmd+F, whatever the keyboard layout', () => {
    const key = {
      key: 'f',
      code: 'KeyF',
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    };
    assert.ok(isFindShortcut(key));
    assert.ok(isFindShortcut({ ...key, ctrlKey: false, metaKey: true }));
    assert.ok(isFindShortcut({ ...key, key: 'ф' }));
    assert.ok(!isFindShortcut({ ...key, ctrlKey: false }));
    assert.ok(!isFindShortcut({ ...key, shiftKey: true }));
    assert.ok(!isFindShortcut({ ...key, key: 'g', code: 'KeyG' }));
  });

  test('steps with Enter and Shift+Enter, and clears on Esc before letting go', () => {
    const steps: number[] = [];
    const queries: string[] = [];
    let blurred = false;
    const field = (query: string) => {
      const element = DiffFind({
        query,
        count: matchCount(query, 3, 0),
        unsearched: 2,
        onQuery: (next) => queries.push(next),
        onStep: (step) => steps.push(step),
      });
      assert.ok(
        isValidElement<{
          children: [
            React.ReactElement<{
              onKeyDown: (event: {
                key: string;
                shiftKey: boolean;
                preventDefault: () => void;
                currentTarget: { blur: () => void };
              }) => void;
            }>,
            React.ReactNode,
          ];
        }>(element),
      );
      return element;
    };
    const press = (query: string, key: string, shiftKey = false) =>
      field(query).props.children[0].props.onKeyDown({
        key,
        shiftKey,
        preventDefault: noop,
        currentTarget: { blur: () => (blurred = true) },
      });
    press('x', 'Enter');
    press('x', 'Enter', true);
    press('x', 'Escape');
    assert.deepStrictEqual(steps, [1, -1]);
    assert.deepStrictEqual(queries, ['']);
    assert.ok(!blurred);
    press('', 'Escape');
    assert.ok(blurred);
    const html = renderToStaticMarkup(field('x'));
    assert.match(html, /placeholder="Search…"/);
    assert.match(
      html,
      /<span class="diff-find-count" title="Large files not shown yet are not searched: 2">1 of 3<\/span>/,
    );
    assert.doesNotMatch(renderToStaticMarkup(field('')), /diff-find-count/);
  });

  test('steps only while there are matches', () => {
    const steps: number[] = [];
    const actions = (matches: number) => {
      const element = FindActions({
        matches,
        onStep: (step) => steps.push(step),
      });
      assert.ok(
        isValidElement<{
          children: React.ReactElement<{
            title: string;
            disabled?: boolean;
            onClick: () => void;
          }>[];
        }>(element),
      );
      return element.props.children;
    };
    for (const button of actions(2)) {
      assert.ok(!button.props.disabled, button.props.title);
      button.props.onClick();
    }
    assert.deepStrictEqual(steps, [-1, 1]);
    assert.deepStrictEqual(
      actions(0).map((button) => [button.props.title, !!button.props.disabled]),
      [
        ['Previous Match (Shift+Enter)', true],
        ['Next Match (Enter)', true],
      ],
    );
  });
});
