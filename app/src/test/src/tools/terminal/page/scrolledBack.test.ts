import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  lineAt,
  scrolledBack,
} from '../../../../../tools/terminal/page/scrolledBack';

suite('The scrollbar of the terminal', () => {
  test('shows how much of the lines kept the screen is and how far through them it is scrolled back, nothing while no line has scrolled off the top, as on the screen of a program that keeps none', () => {
    assert.deepStrictEqual(scrolledBack({ baseY: 90, viewportY: 45 }, 30), {
      at: 0.5,
      length: 0.25,
    });
    assert.deepStrictEqual(scrolledBack({ baseY: 90, viewportY: 90 }, 30), {
      at: 1,
      length: 0.25,
    });
    assert.strictEqual(scrolledBack({ baseY: 0, viewportY: 0 }, 30), undefined);
  });

  test('scrolls to the whole line a share of the way through the lines kept, as the terminal shows whole lines alone', () => {
    assert.strictEqual(lineAt({ baseY: 90 }, 0.5), 45);
    assert.strictEqual(lineAt({ baseY: 90 }, 1), 90);
    assert.strictEqual(lineAt({ baseY: 91 }, 0.5), 46);
    assert.strictEqual(lineAt({ baseY: 0 }, 0.5), 0);
  });
});
