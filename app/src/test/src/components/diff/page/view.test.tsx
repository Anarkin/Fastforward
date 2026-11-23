import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { noop } from '../../../../helpers/fixtures';
import { diffLookOf, diffMeasuring } from '../../../../helpers/diffFixtures';
import { unmeasuredDiff } from '../../../../../components/diff/page/measures';
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
  test('draws a diff with no rule and no variable for where it is scrolled sideways, inline or side by side, as a variable every element under the diff inherits had the browser work out the style of every element of the diff again each step, 31 ms a frame, and a rule for the code of every line 3.4 ms, the code of each line being moved on its own element instead', () => {
    for (const html of [
      shown(true, false),
      shown(false, false),
      shown(true, true),
      shown(false, true),
    ]) {
      assert.doesNotMatch(html, /--split-scroll|<style>|data-split/);
    }
  });
});
