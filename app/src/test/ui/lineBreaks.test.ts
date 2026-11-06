import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  approximateBreaks,
  clusterBoundaries,
  lineBreaks,
  type LineBreaker,
} from '../../ui/lineBreaks';

function breaksOf(
  text: string,
  breaker: LineBreaker = () => [],
  boxes: readonly (readonly [number, number])[] = [],
): number[] {
  const flags = lineBreaks(text, boxes, breaker);
  return [...flags.keys()].filter((at) => flags[at] === 1);
}

function recording(breaks: readonly number[]): {
  readonly breaker: LineBreaker;
  readonly asked: string[];
} {
  const asked: string[] = [];
  return {
    asked,
    breaker: (text) => {
      asked.push(text);
      return breaks;
    },
  };
}

suite('Line breaks', () => {
  test('breaks between two characters of ASCII where Chromium does, before an opening bracket after closing punctuation and after a hyphen or a question mark, and nowhere else', () => {
    assert.deepStrictEqual(breaksOf('f(x).map(y)[0]{z}<w>'), [11, 14, 17]);
    assert.deepStrictEqual(breaksOf('a-b'), [2]);
    assert.deepStrictEqual(breaksOf('a?b'), [2]);
    assert.deepStrictEqual(breaksOf('a--b'), [2, 3]);
    assert.deepStrictEqual(breaksOf(`a-"b`), [2]);
    assert.deepStrictEqual(breaksOf(`a-'b`), [2]);
    assert.deepStrictEqual(breaksOf('a?$b'), [2]);
    assert.deepStrictEqual(breaksOf(`a-)b-$c?"d?'e?)f`), []);
    assert.deepStrictEqual(breaksOf('a/b'), []);
    assert.deepStrictEqual(breaksOf('a.b,c|d&e'), []);
  });

  test('breaks after a hyphen before a digit only after a letter or digit, so a minus sign stays with its number', () => {
    assert.deepStrictEqual(breaksOf('x-1'), [2]);
    assert.deepStrictEqual(breaksOf('1-2'), [2]);
    assert.deepStrictEqual(breaksOf('-1(-1.-1'), []);
  });

  test('asks the line breaker of ICU only where a character beyond ASCII is on either side, as Chromium does, handing it tabs as spaces', () => {
    const { breaker, asked } = recording([2, 4, 7]);

    assert.deepStrictEqual(breaksOf('a\tб-в/x', breaker), [2, 4]);
    assert.deepStrictEqual(asked, ['a б-в/x']);
  });

  test('hands the line breaker each character drawn in a box as one object, as the browser lays a box out', () => {
    const { breaker, asked } = recording([1, 2]);

    assert.deepStrictEqual(breaksOf('a😀b', breaker, [[1, 3]]), [1, 3]);
    assert.deepStrictEqual(asked, ['a￼b']);
  });

  test('leaves a break before an ideographic space drawn in a box, as the browser breaks around a box', () => {
    assert.deepStrictEqual(
      breaksOf('ab　c', recording([2, 3]).breaker, [[2, 3]]),
      [2, 3],
    );
  });

  test('moves a break before an ideographic space past it, as Chromium hangs it at the end of the row', () => {
    assert.deepStrictEqual(breaksOf('a　　b', recording([1, 3]).breaker), [3]);
  });

  test('breaks after every run of spaces and tabs, even after an opening bracket, and never before one, as Chromium does with spaces kept', () => {
    assert.deepStrictEqual(breaksOf('( a'), [2]);
    assert.deepStrictEqual(breaksOf('a 	b'), [3]);
    assert.deepStrictEqual(breaksOf('a 　　b'), [4]);
  });

  test('finds where each character as drawn starts and the text ends, a character of several code points one', () => {
    assert.deepStrictEqual(clusterBoundaries('a👍🏽é中'), [0, 1, 5, 7, 8]);
    assert.deepStrictEqual(clusterBoundaries(''), [0]);
  });

  test('breaks without ICU, as in Node, around Chinese, Japanese and Korean characters, emoji and boxes, but neither after opening nor before closing punctuation', () => {
    assert.deepStrictEqual(approximateBreaks('x中文'), [1, 2]);
    assert.deepStrictEqual(approximateBreaks('中「中」。'), [1]);
    assert.deepStrictEqual(approximateBreaks('a👍🏽b'), [1, 5]);
    assert.deepStrictEqual(approximateBreaks('a￼￼b'), [1, 2, 3]);
    assert.deepStrictEqual(approximateBreaks('árvíztűrő–tükör'), []);
  });
});
