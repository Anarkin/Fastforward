import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  firstMode,
  previewOf,
} from '../../../../tools/commander/page/previews';

suite('Previews of a file viewed', () => {
  test('previews images, SVG among them, and Markdown, by the name of the file', () => {
    assert.strictEqual(previewOf('C:\\pictures\\cat.PNG'), 'image');
    assert.strictEqual(previewOf('/icons/logo.svg'), 'image');
    assert.strictEqual(previewOf('/docs/README.md'), 'markdown');
    assert.strictEqual(previewOf('/docs/notes.markdown'), 'markdown');
    assert.strictEqual(previewOf('/docs/notes.txt'), undefined);
  });

  test('opens a file in its preview when it has one, and in text otherwise, binary or not', () => {
    assert.strictEqual(firstMode('/a/cat.png'), 'preview');
    assert.strictEqual(firstMode('/a/README.md'), 'preview');
    assert.strictEqual(firstMode('/a/app.exe'), 'text');
    assert.strictEqual(firstMode('/a/notes.txt'), 'text');
  });
});
