import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../components/diff/page/diff';
import { imagePanes } from '../../../../../components/diff/page/imagePanes';
import { ImageDiff } from '../../../../../components/diff/page/imagePreview';

suite('Diff rows', () => {
  test('previews an image on both sides when side by side, hatching the side it lacks, and only on the sides it has inline', () => {
    const [added] = parsePatch(
      [
        'diff --git a/a.png b/a.png',
        'new file mode 100644',
        `index ${'0'.repeat(40)}..${'2'.repeat(40)}`,
        'Binary files /dev/null and b/a.png differ',
      ].join('\n'),
    );
    const origin = { route: '/image', root: '/repo', hash: 'c'.repeat(40) };
    const shown = (sideBySide: boolean) =>
      imagePanes(origin, added, sideBySide).map((pane) => [
        pane.side,
        pane.url !== undefined,
      ]);
    assert.deepStrictEqual(shown(false), [['new', true]]);
    assert.deepStrictEqual(shown(true), [
      ['old', false],
      ['new', true],
    ]);
    const markup = renderToStaticMarkup(
      <ImageDiff panes={imagePanes(origin, added, true)} />,
    );
    assert.match(
      markup,
      /<div class="image-pane filler"><div class="image-frame"><\/div><\/div>/,
    );
    assert.match(markup, /class="image-pane"/);
  });
});
