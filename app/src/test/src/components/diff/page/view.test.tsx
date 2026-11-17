import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { noop } from '../../../../helpers/fixtures';
import { diffLookOf, diffMeasuring } from '../../../../helpers/diffFixtures';
import { unmeasuredDiff } from '../../../../../components/diff/page/measures';
import { gapWidth } from '../../../../../components/diff/page/textLayout';
import { DiffView } from '../../../../../components/diff/page/view';

suite('A diff shown anew', () => {
  test('starts from the text measured for the diff shown before, so the rows it draws are not styled again once it measures its text alike', () => {
    const measures = {
      ...unmeasuredDiff,
      text: {
        charWidth: 7,
        font: '12px mono',
        spacing: 0,
        scale: 1.25,
        lineHeight: 18,
        padding: { top: 0.8, bottom: 0.8 },
      },
    };
    const html = renderToStaticMarkup(
      <DiffView
        error={null}
        keptPlace={undefined}
        onPlace={noop}
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
        look={diffLookOf()}
        measures={measures}
        measuring={diffMeasuring}
      />,
    );
    assert.match(html, /--diff-word-padding-top:0.8px/);
    assert.ok(
      html.includes(`--diff-gap-width:${gapWidth(1.25)}px`),
      'the gap of the scale measured',
    );
  });
});
