import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { noop } from '../../../../helpers/fixtures';
import { withStores } from '../../../../helpers/componentFixtures';
import { createGitStore } from '../../../../../tools/git/page/store';
import { gapWidth } from '../../../../../tools/git/page/textLayout';
import { DiffView } from '../../../../../tools/git/page/diffView';

suite('A diff shown anew', () => {
  test('starts from the text measured for the diff shown before, so the rows it draws are not styled again once it measures its text alike', () => {
    const git = createGitStore(noop, {
      diffText: {
        charWidth: 7,
        font: '12px mono',
        spacing: 0,
        scale: 1.25,
        lineHeight: 18,
        padding: { top: 0.8, bottom: 0.8 },
      },
    });
    const html = renderToStaticMarkup(
      withStores(
        <DiffView
          error={null}
          files={[]}
          whole={undefined}
          origin={undefined}
          loading={false}
          diff={1}
          onLoad={noop}
          texts={new Map()}
          onLoadTexts={noop}
          changeMarks
          matches={[]}
          current={0}
          jump={0}
          firstChange={undefined}
        />,
        { git },
      ),
    );
    assert.match(html, /--diff-word-padding-top:0.8px/);
    assert.ok(
      html.includes(`--diff-gap-width:${gapWidth(1.25)}px`),
      'the gap of the scale measured',
    );
  });
});
