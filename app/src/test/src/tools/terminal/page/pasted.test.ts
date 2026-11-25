import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { withoutPasteMarks } from '../../../../../tools/terminal/page/pasted';

const escape = String.fromCharCode(27);
const csi = String.fromCharCode(0x9b);

suite('Text pasted into the terminal', () => {
  test('leaves out the marks that end or start a bracketed paste, so a text pasted cannot end its bracket early and have the shell run what follows as typed', () => {
    assert.strictEqual(
      withoutPasteMarks(`foo${escape}[201~rm -rf ~\n`),
      'foorm -rf ~\n',
    );
    assert.strictEqual(
      withoutPasteMarks(`${escape}[200~a${escape}[201~b`),
      'ab',
    );
  });

  test('leaves out the marks written with the one character of the 8-bit control sequence too', () => {
    assert.strictEqual(withoutPasteMarks(`a${csi}201~b${csi}200~c`), 'abc');
  });

  test('leaves out a mark that taking out another one put together, rather than leaving the one it made', () => {
    assert.strictEqual(
      withoutPasteMarks(`x${escape}[20${escape}[201~1~y`),
      'xy',
    );
  });

  test('keeps every other character as pasted, the colors of escape sequences, tabs, line breaks and text of any script', () => {
    const kept = `${escape}[31mred${escape}[0m\tcol\r\nnext 中 😀 [201~`;
    assert.strictEqual(withoutPasteMarks(kept), kept);
  });
});
