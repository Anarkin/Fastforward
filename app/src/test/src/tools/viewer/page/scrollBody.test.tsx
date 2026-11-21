import * as assert from 'node:assert';
import { renderToStaticMarkup as markupOf } from 'react-dom/server';
import { suite, test } from 'vitest';
import type { ByteRange } from '../../../../../tools/viewer/shared/protocol';
import { ScrollBody } from '../../../../../tools/viewer/page/scrollBody';
import { withStores } from '../../../../helpers/componentFixtures';
const renderToStaticMarkup = (node: React.ReactNode) =>
  markupOf(withStores(node));

function scrollBody(
  matches: readonly ByteRange[] = [],
  wrapped = false,
  lead?: number,
): string {
  return renderToStaticMarkup(
    <ScrollBody
      thumb={{ start: 0.5, length: 0.1 }}
      ends={{ atStart: false, atEnd: false }}
      onScreen={() => {}}
      move={() => {}}
      jump={() => {}}
      error={undefined}
      matches={matches}
      size={1024}
      wrapped={wrapped}
      lead={lead}
    >
      text
    </ScrollBody>,
  );
}

suite('Commander scroll body', () => {
  test('stands a scrollbar of the browser in for its rows, which scroll by themselves, for the browser to draw its thumb as it draws every other, the ticks of what a find matched laid over its track', () => {
    assert.match(
      scrollBody(),
      /<div class="scroll-proxy-frame vertical"><div class="scroll-proxy vertical"><div class="scroll-proxy-size"><\/div><\/div><div class="scrollbar-marks">/,
    );
  });

  test('marks the rows of wrapped text as wrapped, to lay them out as wide as the viewer, and leaves rows not wrapped as wide as their text', () => {
    assert.match(scrollBody([], true), /class="viewer-rows wrapped"/);
    assert.match(scrollBody(), /class="viewer-rows"/);
  });

  test('ticks the track where the matches are in the file by their bytes, as the scrollbar of a diff is marked', () => {
    assert.match(
      scrollBody([{ start: 512, end: 544 }]),
      /class="scrollbar-mark match" style="--mark-top:50%;--mark-height:3.125%"/,
    );
    assert.doesNotMatch(scrollBody(), /scrollbar-mark /);
  });

  test('leaves the room of 64 rows above the rows of a file at rest, wherever it is scrolled to, for the rows to stay where they are in their box as it glides either way and the box to scroll by instead, so only the row that comes into view is painted', () => {
    assert.match(
      scrollBody([], false, 37),
      /class="viewer-rows" style="--viewer-lead:64"/,
    );
    assert.match(
      scrollBody([], false, 70_000_000),
      /class="viewer-rows" style="--viewer-lead:64"/,
    );
    assert.match(scrollBody(), /class="viewer-rows" style="--viewer-lead:64"/);
  });
});
