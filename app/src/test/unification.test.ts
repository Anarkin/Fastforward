import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { read, sourceFiles } from './helpers/sourceGraph';

const codeFiles = sourceFiles.filter((file) => /\.tsx?$/.test(file));

const doing = (pattern: RegExp): string[] =>
  codeFiles.filter((file) => pattern.test(read(file))).toSorted();

suite('Unification', () => {
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
});
