import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { stepped } from '../../../../../tools/terminal/page/lineSteps';

const glide = 150;

suite('Lines a terminal steps through its history', () => {
  test('steps from the line a glide is going to rather than the line it has come to, so a notch of the wheel turned while the one before still glides loses none of its rows, as two notches of two rows scrolled back three, xterm.js starting each from where its glide is', () => {
    const first = stepped(
      undefined,
      { shown: 100, last: 100 },
      -2,
      1000,
      glide,
    );
    assert.deepStrictEqual(first, {
      by: -2,
      heading: { from: 100, to: 98, until: 1150 },
    });
    const second = stepped(
      first.heading,
      { shown: 99, last: 100 },
      -2,
      1015,
      glide,
    );
    assert.deepStrictEqual(second, {
      by: -3,
      heading: { from: 100, to: 96, until: 1150 },
    });
    const turnedBack = stepped(
      second.heading,
      { shown: 98, last: 100 },
      1,
      1040,
      glide,
    );
    assert.deepStrictEqual(turnedBack, {
      by: -1,
      heading: { from: 100, to: 97, until: 1150 },
    });
  });

  test('stays on the line shown where a step leads there while a glide passes it, the glide stopped rather than left to go on', () => {
    const down = stepped(undefined, { shown: 98, last: 100 }, 2, 1000, glide);
    assert.deepStrictEqual(
      stepped(down.heading, { shown: 99, last: 100 }, -1, 1020, glide),
      { by: 0, heading: { from: 98, to: 99, until: 1150 } },
    );
  });

  test('steps from the line shown once the glide has ended, or once something else has scrolled the screen away from between where the glide started and where it was going, as a key typed takes the screen to its last line', () => {
    const { heading } = stepped(
      undefined,
      { shown: 100, last: 100 },
      -2,
      1000,
      glide,
    );
    assert.deepStrictEqual(
      stepped(heading, { shown: 98, last: 100 }, -2, 1150, glide),
      { by: -2, heading: { from: 98, to: 96, until: 1300 } },
    );
    const up = stepped(undefined, { shown: 50, last: 100 }, -2, 1000, glide);
    assert.deepStrictEqual(
      stepped(up.heading, { shown: 100, last: 100 }, -2, 1010, glide),
      { by: -2, heading: { from: 100, to: 98, until: 1160 } },
    );
  });

  test('stops at the first and at the last line, however far a step asks', () => {
    assert.deepStrictEqual(
      [
        stepped(undefined, { shown: 3, last: 100 }, -10, 0, glide).by,
        stepped(undefined, { shown: 95, last: 100 }, 10, 0, glide).by,
        stepped(undefined, { shown: 0, last: 0 }, 10, 0, glide).by,
      ],
      [-3, 5, 0],
    );
  });

  test('keeps no line it is going to where scrolling does not glide, the screen being there at once', () => {
    assert.deepStrictEqual(
      stepped(undefined, { shown: 100, last: 100 }, -2, 1000, 0),
      { by: -2, heading: undefined },
    );
  });
});
