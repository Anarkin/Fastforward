import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../../components/diff/page/diff';
import { imagePanes } from '../../../../../components/diff/page/imagePanes';
import { ImageDiff } from '../../../../../components/diff/page/imagePreview';

suite('Diff rows', () => {
  test('previews an image on both sides inline as side by side, hatching the side it lacks, as an image added inline stood on the half of the old side', () => {
    const [added] = parsePatch(
      [
        'diff --git a/a.png b/a.png',
        'new file mode 100644',
        `index ${'0'.repeat(40)}..${'2'.repeat(40)}`,
        'Binary files /dev/null and b/a.png differ',
      ].join('\n'),
    );
    const origin = { route: '/image', root: '/repo', hash: 'c'.repeat(40) };
    assert.deepStrictEqual(
      imagePanes(origin, added).map((pane) => [
        pane.side,
        pane.url !== undefined,
      ]),
      [
        ['old', false],
        ['new', true],
      ],
    );
    const markup = renderToStaticMarkup(
      <ImageDiff panes={imagePanes(origin, added)} top={36} />,
    );
    assert.match(
      markup,
      /<div class="image-pane filler" style="--diff-row-top:36px"><div class="image-frame"><\/div><\/div>/,
    );
    assert.match(markup, /class="image-pane"/);
  });
});
