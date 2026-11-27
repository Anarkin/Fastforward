import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { read, sourceFiles } from './helpers/sourceGraph';

const codeFiles = sourceFiles.filter((file) => /\.tsx?$/.test(file));

const doing = (pattern: RegExp): string[] =>
  codeFiles.filter((file) => pattern.test(read(file))).toSorted();

const styling = (pattern: RegExp): string[] =>
  sourceFiles
    .filter((file) => file.endsWith('.css') && pattern.test(read(file)))
    .toSorted();

const numbersDeclared = (): ReadonlyMap<string, readonly string[]> => {
  const declared = new Map<string, string[]>();
  for (const file of codeFiles) {
    for (const [, name, value] of read(file).matchAll(
      /^(?:export )?const (\w+) = ([\d_.e-]+);$/gm,
    )) {
      const key = `${name} = ${value}`;
      declared.set(key, [...(declared.get(key) ?? []), file]);
    }
  }
  return new Map([...declared].filter(([, files]) => files.length > 1));
};

suite('Unification', () => {
  test('declares a number once, in the part it belongs to, rather than the same name with the same value in parts that must agree on it, the version of the saved view of each tool being its own', () => {
    assert.deepStrictEqual([...numbersDeclared().keys()].toSorted(), [
      'viewVersion = 1',
    ]);
  });

  test('defines the unit Chromium lays out in, a 64th of a pixel, once, beside the rounding to it, rather than in every part that rounds to it', () => {
    assert.deepStrictEqual(doing(/\blayoutUnits\s*=\s*64\b/), [
      'lib/page/pixelBoxes.ts',
    ]);
    assert.deepStrictEqual(doing(/\*\s*layoutUnits\)\s*\/\s*layoutUnits/), [
      'lib/page/pixelBoxes.ts',
    ]);
  });

  test('splits a text into its characters and its lines with one segmenter each, so every part counts characters alike, the status of the editor having counted them with a segmenter of its own', () => {
    assert.deepStrictEqual(doing(/new Intl\.Segmenter\(/), [
      'lib/page/graphemes.ts',
      'lib/page/lineBreaks.ts',
    ]);
  });

  test('places a text on the cells of its rows, the row of a character, its column, the character under a column, the cells it takes and what a block cursor shows over it, by one module of the cells, which the editor and the canvas both use, the canvas having laid its text out by code of its own and drawn an emoji on one cell', () => {
    assert.deepStrictEqual(
      doing(
        /\bfunction (?:rowHolding|columnIn|charAt|cellsAt|shownUnder|underAt)\b/,
      ),
      ['components/cells/page/textPlaces.ts'],
    );
  });

  test('reads the code and the message of an error in one module, shared by the page and the main process, rather than by a copy of codeOf, isMissing or reasonOf in every part that reads one, of which a dozen were', () => {
    assert.deepStrictEqual(
      doing(
        /'code' in \w+|Reflect\.get\(\w+, 'code'\)|instanceof Error \? \w+\.message : String\(/,
      ),
      ['lib/shared/errors.ts'],
    );
    assert.deepStrictEqual(
      doing(/\b(?:function|const) (?:codeOf|messageOf|isMissing|reasonOf)\b/),
      ['lib/main/missing.ts', 'lib/main/reasons.ts', 'lib/shared/errors.ts'],
    );
  });

  test('writes the byte order marks of the encodings, their bytes and their character, in one module of the encodings, which every part that reads, writes or strips one uses, rather than in the ten copies the editor, the viewer, the canvas and the settings had', () => {
    assert.deepStrictEqual(
      doing(
        /0xef,\s*0xbb|0xff,\s*0xfe\]|0xfe,\s*0xff\]|0xfe_ff|\\uFEFF|\uFEFF/i,
      ),
      ['components/encodings/shared/byteOrderMarks.ts'],
    );
  });

  test('signs a line ending by one function of the cells, and keeps the text of each line ending in one table of the editor, the editor having signed its line endings by a table of its own and its clipboard and its codec each written them out', () => {
    assert.deepStrictEqual(doing(/symbols\.carriageReturn/), [
      'components/cells/page/blankSigns.ts',
      'components/cells/page/textPlaces.ts',
      'tools/viewer/page/hex.ts',
    ]);
    assert.deepStrictEqual(doing(/crlf: ['`]\\r/), [
      'tools/editor/shared/textMarks.ts',
    ]);
  });

  test('steps and deletes through a text by characters and by words in one component, which the editor and the canvas both type through, the canvas having stepped by words of its own that left out the accents and stopped at a line break the editor steps over', () => {
    assert.deepStrictEqual(
      doing(
        /\bfunction (?:characterDeleted|groupDeleted|movedSideways|wordStep)\b/,
      ),
      ['components/editing/page/textSteps.ts'],
    );
    assert.deepStrictEqual(doing(/\bclusterBreak\(/), [
      'components/cells/page/textPlaces.ts',
      'components/cells/page/textSelection.ts',
      'components/editing/page/textSteps.ts',
      'lib/page/graphemes.ts',
      'shell/page/textCursor.ts',
    ]);
    assert.deepStrictEqual(doing(/charCategorizer/), []);
    assert.deepStrictEqual(doing(/\bstate\.wordAt\(/), []);
  });

  test('tells a letter, a mark, a digit or an underscore of a word by one class, which the steps, the finds, the occurrences and the diff all take theirs from, and the anchors of a Markdown heading by the class GitHub takes', () => {
    assert.deepStrictEqual(doing(/\\p\{L\}/), [
      'components/diff/page/tokenSteps.ts',
      'lib/shared/textMatches.ts',
      'tools/viewer/page/markdownRender.ts',
    ]);
  });

  test('rounds the advance and the row of the monospace font to whole device pixels once, for the whole window, rather than in every view, the canvas having measured its text unrounded and so centered a wide character a tenth of a pixel off the viewer', () => {
    assert.deepStrictEqual(styling(/round\(1ch/), ['shell/page/window.css']);
    assert.deepStrictEqual(
      styling(/var\(--monospace-font-size\) \* var\(--monospace-line-height\)/),
      ['shell/page/window.css'],
    );
    const unsnapped = sourceFiles
      .filter((file) => file.endsWith('.css'))
      .flatMap((file) =>
        [...read(file).matchAll(/([^{}]+)\{([^}]*)\}/g)]
          .filter(
            ([, selector = '', body = '']) =>
              /probe/.test(selector) &&
              /font-family: var\(--monospace-font-family\)/.test(body) &&
              !/letter-spacing: calc\(var\(--text-advance\) - 1ch\)/.test(body),
          )
          .map(([, selector = '']) => `${file} ${selector.trim()}`),
      );
    assert.deepStrictEqual(unsnapped, []);
  });

  test('takes what is typed and composed through one input session of the editing component, which the editor and the canvas both open their EditContext through, the canvas having given an input method the box of its caret for every character it asked for', () => {
    assert.deepStrictEqual(doing(/\btextContextIn\(/), [
      'components/editing/page/inputSession.ts',
      'lib/page/textContext.ts',
    ]);
    assert.deepStrictEqual(doing(/addEventListener\('textupdate'/), [
      'components/editing/page/inputSession.ts',
    ]);
  });

  test('paints a cursor and starts its blink over once it moves by one mark of the library, which the editor, the canvas, the text boxes and the terminal all draw theirs by, rather than by a copy of that in each', () => {
    assert.deepStrictEqual(doing(/\bpaintCursor\(/), ['lib/page/cursor.ts']);
    assert.deepStrictEqual(doing(/'cursor-blink-again'|=== 'cursor-blink'/), [
      'lib/page/cursor.ts',
    ]);
  });

  test('binds the keys that step through the matches of a search and close it once, for every search of the app, and takes them in a search box by one handler, rather than in a binding and a handler of each tool', () => {
    assert.deepStrictEqual(doing(/strings\.actions\.(?:match|stopFinding)\b/), [
      'lib/page/findKeys.ts',
    ]);
    assert.deepStrictEqual(doing(/keyPressed\(\w+Keymap\.match, event\)/), [
      'tools/editor/page/findBar.tsx',
    ]);
  });

  test('seeks the copies of a selection by one rule, its blanks at its ends left out and 200 characters or bytes at most, in the views, the hex, the bytes and the editor alike, rather than by a limit of each and an editor that sought the blanks too', () => {
    assert.deepStrictEqual(
      doing(/\b(?:longestWord|mostSought|mostSelected)\b/),
      [],
    );
    assert.deepStrictEqual(doing(/\blongestCopy = /), [
      'lib/shared/textMatches.ts',
    ]);
  });

  test('reaches from the word or line a double or triple click took to where the pointer is dragged by one rule, which the views, the editor and the canvas all extend a selection by', () => {
    assert.deepStrictEqual(doing(/anchor: grip\.last|grip\.to, Math\.min/), [
      'components/cells/page/textSelection.ts',
    ]);
    assert.deepStrictEqual(doing(/\bgrippedReach\(/), [
      'components/cells/page/cellSelecting.ts',
      'tools/canvas/page/boardView.tsx',
      'tools/editor/page/pointing.ts',
    ]);
  });

  test('counts the columns of a text by one engine of the cells, a tab to its stop and a cluster by its width, rather than by a second engine of the library that counted a character beyond the first plane two columns where the cells drew it in one, the drawing of the cells, the measures of the diff, the wrapping of the library and the index of the rows of the editor stepping through them as they go until they take the engine too', () => {
    assert.deepStrictEqual(doing(/\btabStop\(/), [
      'components/cells/page/columns.ts',
      'components/cells/page/textCells.ts',
      'components/diff/page/rowMeasures.ts',
      'lib/page/rowBreaks.ts',
      'lib/page/tabStops.ts',
      'lib/page/wordWrap.ts',
      'tools/editor/page/rowIndex.ts',
    ]);
    assert.deepStrictEqual(
      doing(/\bfunction (?:columnsOf|columnAt|charAtColumn|columnsAlong)\b/),
      ['components/cells/page/columns.ts'],
    );
  });

  test('starts a new search at the first match at or after where the view is by one rule, which the editor, the viewer, the diff and the terminal all take, the viewer and the diff having started at the first match of all', () => {
    assert.deepStrictEqual(doing(/=== -1 \? 0 : at\b|\?\? found\.at\(0\)/), [
      'lib/shared/textMatches.ts',
    ]);
    assert.deepStrictEqual(doing(/\bfirstNotBefore\(/), [
      'components/diff/page/finding.ts',
      'tools/editor/page/find.ts',
      'tools/terminal/page/screenFind.ts',
      'tools/viewer/page/find.ts',
    ]);
  });

  test('follows the pointer over a list that draws the row under it by one helper, which finds that row again once the list scrolls under a pointer at rest, as the two lists of git kept the row they were over before the scroll', () => {
    const keepingHover = doing(/\bhovered\.current = |sight\.point\(/);
    assert.deepStrictEqual(
      keepingHover.filter((file) => !/\bfollowPointer\(/.test(read(file))),
      [],
    );
    assert.ok(keepingHover.length >= 2, JSON.stringify(keepingHover));
  });
});
