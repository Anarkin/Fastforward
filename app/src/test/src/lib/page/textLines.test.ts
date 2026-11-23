import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { brokenLines } from '../../../../lib/page/textLines';

suite('Lines of a text', () => {
  test('breaks a text at each line feed, at a carriage return and the line feed after it, and at a carriage return alone, as the editor breaks it, keeping each carriage return in its line and telling the lines a line feed ends, with no line after the last break', () => {
    assert.deepStrictEqual(brokenLines('one\rtwo\r\nthree\n\rfour\r'), [
      { text: 'one\r', fed: false },
      { text: 'two\r', fed: true },
      { text: 'three', fed: true },
      { text: '\r', fed: false },
      { text: 'four\r', fed: false },
    ]);
    assert.deepStrictEqual(brokenLines('a\n\nb'), [
      { text: 'a', fed: true },
      { text: '', fed: true },
      { text: 'b', fed: false },
    ]);
    assert.deepStrictEqual(brokenLines(''), []);
  });
});
