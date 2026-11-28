import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { previewEncoding } from '../../../../../tools/viewer/page/wholeText';

suite('The whole text of a file viewed', () => {
  test('reads a Markdown file to preview in the encoding found in it, as the text of the viewer reads it, and in UTF-8 where none was found, as it was always read as UTF-8 and a file in UTF-16 or a code page showed as ¤ and replacement characters', () => {
    assert.deepStrictEqual(
      [
        previewEncoding({ detected: 'utf-16le' }),
        previewEncoding({ detected: 'windows-1252' }),
        previewEncoding({}),
      ],
      ['utf-16le', 'windows-1252', 'utf-8'],
    );
  });
});
