import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  viewerKey,
  type ViewerKeys,
} from '../../../../tools/commander/page/viewerKeys';
import { keyPress } from '../../../fixtures';

const text: ViewerKeys = { mode: 'text', readsText: true, showsImage: false };
const hex: ViewerKeys = { mode: 'hex', readsText: false, showsImage: false };
const image: ViewerKeys = {
  mode: 'preview',
  readsText: false,
  showsImage: true,
};

suite('Viewer keys', () => {
  test('finds in the file on Mod+F and shows it as hex, text or a preview on 1, 2 and 3, whatever it shows', () => {
    assert.deepStrictEqual(viewerKey(keyPress('f', { ctrlKey: true }), hex), {
      kind: 'find',
    });
    assert.deepStrictEqual(viewerKey(keyPress('3'), text), {
      kind: 'viewAs',
      mode: 'preview',
    });
    assert.deepStrictEqual(viewerKey(keyPress('1'), image), {
      kind: 'viewAs',
      mode: 'hex',
    });
  });

  test('chooses the encoding only of a text, and the language, wrapping and whitespace only while text is read', () => {
    assert.deepStrictEqual(viewerKey(keyPress('e'), text), {
      kind: 'encoding',
    });
    assert.strictEqual(viewerKey(keyPress('e'), hex), undefined);
    assert.deepStrictEqual(viewerKey(keyPress('l'), text), {
      kind: 'language',
    });
    assert.deepStrictEqual(viewerKey(keyPress('w'), text), { kind: 'wrap' });
    assert.deepStrictEqual(viewerKey(keyPress('.'), text), {
      kind: 'whitespace',
    });
    for (const key of ['l', 'w', '.']) {
      assert.strictEqual(viewerKey(keyPress(key), hex), undefined, key);
    }
  });

  test('shows an image at its real size on F only while an image is shown, leaving other keys alone', () => {
    assert.deepStrictEqual(viewerKey(keyPress('f'), image), {
      kind: 'realSize',
    });
    assert.strictEqual(viewerKey(keyPress('f'), text), undefined);
    assert.strictEqual(viewerKey(keyPress('x'), text), undefined);
  });
});
