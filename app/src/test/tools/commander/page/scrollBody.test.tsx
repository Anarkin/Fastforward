import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { ScrollBody } from '../../../../tools/commander/page/scrollBody';

function scrollBody(barPinned: boolean): string {
  return renderToStaticMarkup(
    <ScrollBody
      thumb={{ start: 0.5, length: 0.1 }}
      onScreen={() => {}}
      move={() => {}}
      jump={() => {}}
      error={undefined}
      barPinned={barPinned}
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
});
