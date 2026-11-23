import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  firstMode,
  previewKinds,
  previewOf,
  previewUrl,
} from '../../../../../tools/viewer/page/previews';

suite('Previews of a file viewed', () => {
  test('previews images, SVG among them, and Markdown, by the name of the file', () => {
    assert.strictEqual(previewOf('C:\\pictures\\cat.PNG'), 'image');
    assert.strictEqual(previewOf('/icons/logo.svg'), 'image');
    assert.strictEqual(previewOf('/docs/README.md'), 'markdown');
    assert.strictEqual(previewOf('/docs/notes.markdown'), 'markdown');
    assert.strictEqual(previewOf('/docs/notes.txt'), undefined);
  });

  test('lists the kinds of file it previews, each with every extension it previews it by, from the tables it decides by, so the list told in the tooltip of the preview is never out of date', () => {
    const kinds = previewKinds();

    assert.deepStrictEqual(kinds, [
      { name: 'Markdown', values: '.md .markdown' },
      { name: 'PDF', values: '.pdf' },
      {
        name: 'Images',
        values: '.png .jpg .jpeg .gif .webp .avif .bmp .ico .svg',
      },
    ]);
    const previewed = { Markdown: 'markdown', PDF: 'pdf', Images: 'image' };
    for (const { name, values } of kinds) {
      for (const extension of values.split(' ')) {
        assert.strictEqual(
          previewOf(`/a/file${extension.toUpperCase()}`),
          Reflect.get(previewed, name),
          extension,
        );
      }
    }
  });

  test('opens a file in its preview when it has one, and in text otherwise, binary or not', () => {
    assert.strictEqual(firstMode('/a/cat.png'), 'preview');
    assert.strictEqual(firstMode('/a/README.md'), 'preview');
    assert.strictEqual(firstMode('/a/app.exe'), 'text');
    assert.strictEqual(firstMode('/a/notes.txt'), 'text');
  });

  test('asks for an image or PDF again once the file changes, though its size does not, rather than showing the one fetched before', () => {
    const before = previewUrl(
      { tab: '3', size: 4, version: '7:1000:4' },
      '/a/cat.png',
    );
    const after = previewUrl(
      { tab: '3', size: 4, version: '7:2000:4' },
      '/a/cat.png',
    );

    assert.notStrictEqual(after, before);
    assert.strictEqual(
      previewUrl({ tab: '3', size: 4, version: '7:2000:4' }, '/a/cat.png'),
      after,
    );
  });
});
