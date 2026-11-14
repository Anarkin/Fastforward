import * as assert from 'node:assert';
import { Text } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  foundIn,
  replacedText,
  type FindQuery,
} from '../../../../../tools/commander/page/editorFind';

const query = (text: string, chosen: Partial<FindQuery> = {}): FindQuery => ({
  text,
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  ...chosen,
});

const doc = Text.of(['Let let LET', 'letter (a+b)']);

const places = (found: ReturnType<typeof foundIn>) =>
  found.found.map(({ from, to }) => doc.sliceString(from, to));

suite('Finding in the editor', () => {
  test('finds the text typed in any case, in its case once told to, as whole words only once told to', () => {
    assert.deepStrictEqual(places(foundIn(doc, query('let'))), [
      'Let',
      'let',
      'LET',
      'let',
    ]);
    assert.deepStrictEqual(
      places(foundIn(doc, query('let', { caseSensitive: true }))),
      ['let', 'let'],
    );
    assert.deepStrictEqual(
      places(foundIn(doc, query('let', { wholeWord: true }))),
      ['Let', 'let', 'LET'],
    );
  });

  test('finds text with characters of regular expressions as it is, and a regular expression once told to, saying one that is not valid', () => {
    assert.deepStrictEqual(places(foundIn(doc, query('(a+b)'))), ['(a+b)']);
    assert.deepStrictEqual(
      places(foundIn(doc, query('l\\w+r', { regex: true }))),
      ['letter'],
    );
    assert.strictEqual(foundIn(doc, query('(', { regex: true })).invalid, true);
    assert.strictEqual(foundIn(doc, query('')).invalid, false);
  });

  test('replaces a match with the text typed, and with the groups of a regular expression put in', () => {
    assert.strictEqual(
      replacedText('let', query('let'), '$1 const'),
      '$1 const',
    );
    assert.strictEqual(
      replacedText('a+b', query('(\\w)\\+(\\w)', { regex: true }), '$2-$1'),
      'b-a',
    );
  });
});
