import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { noop } from '../../../../helpers/fixtures';
import { diffLookOf, diffMeasuring } from '../../../../helpers/diffFixtures';
import { unmeasuredDiff } from '../../../../../components/diff/page/measures';
import { gapWidth } from '../../../../../components/diff/page/textLayout';
import { DiffView } from '../../../../../components/diff/page/view';
import { unplaced } from '../../../../../components/diff/page/place';

const shown = (sideBySide: boolean, wordWrap: boolean) =>
  renderToStaticMarkup(
    <DiffView
      error={null}
      keptPlace={{ ...unplaced, sideways: 40 }}
      placeNow={() => undefined}
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
      look={{ ...diffLookOf(), sideBySide, wordWrap }}
      measures={unmeasuredDiff}
      measuring={diffMeasuring}
    />,
  );

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
        placeNow={() => undefined}
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

  test('moves the code of both sides of a side by side diff sideways by a rule of its own for their code alone, not by a variable every element under the diff inherits, as the browser worked out the style of every element of the diff again each time the variable changed, 31 ms a frame of a scroll sideways', () => {
    const split = shown(true, false);
    const [, id] = /data-split="([^"]+)"/.exec(split) ?? [];
    assert.ok(id);
    assert.ok(
      split.includes(
        `<style>.diff-view[data-split="${id}"] .split-code .code{transform:translateX(-40px)}</style>`,
      ),
      split.slice(0, 600),
    );
    for (const html of [split, shown(false, false), shown(true, true)]) {
      assert.doesNotMatch(html, /--split-scroll/);
    }
    assert.doesNotMatch(shown(false, false), /<style>/);
    assert.doesNotMatch(shown(true, true), /<style>/);
  });
});
