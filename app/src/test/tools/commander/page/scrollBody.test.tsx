import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import type { ByteRange } from '../../../../tools/commander/shared/protocol';
import {
  matchTicks,
  ScrollBody,
} from '../../../../tools/commander/page/scrollBody';

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

  test('ticks matches too close to tell apart once, each at least the least tick tall, so a file of many matches draws a tick per few pixels at most', () => {
    assert.deepStrictEqual(
      matchTicks(
        [
          { start: 0, end: 8 },
          { start: 12, end: 16 },
          { start: 512, end: 544 },
        ],
        1024,
        1 / 64,
      ),
      [
        { top: 0, height: 0.02734375 },
        { top: 0.5, height: 0.03125 },
      ],
    );
    assert.deepStrictEqual(matchTicks([{ start: 0, end: 8 }], 0, 1 / 64), []);
  });
});
