import * as assert from 'node:assert';
import { renderToStaticMarkup as markupOf } from 'react-dom/server';
import { suite, test } from 'vitest';
import type { ByteRange } from '../../../../../tools/viewer/shared/protocol';
import { ScrollBody } from '../../../../../tools/viewer/page/scrollBody';
import { withStores } from '../../../../helpers/componentFixtures';
const renderToStaticMarkup = (node: React.ReactNode) =>
  markupOf(withStores(node));

function scrollBody(
  barPinned: boolean,
  matches: readonly ByteRange[] = [],
  wrapped = false,
): string {
  return renderToStaticMarkup(
    <ScrollBody
      thumb={{ start: 0.5, length: 0.1 }}
      onScreen={() => {}}
      move={() => {}}
      jump={() => {}}
      error={undefined}
      barPinned={barPinned}
      matches={matches}
      size={1024}
      wrapped={wrapped}
    >
      text
    </ScrollBody>,
  );
}

suite('Commander scroll body', () => {
  test('shows the thumb while pinned, as while finding, so jumping from match to match shows where in the file it is, and hides it otherwise until scrolled or pointed at', () => {
    assert.match(
      scrollBody(true),
      /class="overlay-scrollbar viewer-thumb shown"/,
    );
    assert.match(scrollBody(false), /class="overlay-scrollbar viewer-thumb"/);
  });

  test('marks the rows of wrapped text as wrapped, to lay them out as wide as the viewer, and leaves rows not wrapped as wide as their text', () => {
    assert.match(scrollBody(false, [], true), /class="viewer-rows wrapped"/);
    assert.match(scrollBody(false), /class="viewer-rows"/);
  });

  test('ticks the track where the matches are in the file by their bytes, as the minimap of a diff does', () => {
    assert.match(
      scrollBody(false, [{ start: 512, end: 544 }]),
      /class="minimap-mark match" style="top:50%;height:3.125%"/,
    );
    assert.doesNotMatch(scrollBody(false), /minimap-mark/);
  });
});
