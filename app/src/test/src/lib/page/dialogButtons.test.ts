import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { suite, test } from 'vitest';
import { moveBetweenButtons } from '../../../../lib/page/dialogButtons';

function buttons() {
  const { document } = new JSDOM(
    '<!doctype html><div class="confirm-buttons"><button>Cancel</button><button disabled>Off</button><button>Other</button><button class="default">OK</button></div><input>',
  ).window;
  const row = document.querySelector<HTMLElement>('.confirm-buttons');
  assert.ok(row);
  const press = (
    key: string,
    target: Element | null = document.activeElement,
  ) => {
    let prevented = false;
    moveBetweenButtons({
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      target,
      currentTarget: row,
      preventDefault: () => {
        prevented = true;
      },
    });
    return prevented;
  };
  const focused = () => document.activeElement?.textContent;
  const all = row.querySelectorAll('button');
  return { document, press, focused, all };
}

suite('Dialog buttons', () => {
  test('moves the focus between the buttons of a dialog on the arrow keys, Home and End, past the disabled ones and around the ends', () => {
    const { press, focused, all } = buttons();
    all[3].focus();
    assert.ok(press('ArrowLeft'));
    assert.strictEqual(focused(), 'Other');
    press('ArrowUp');
    assert.strictEqual(focused(), 'Cancel');
    press('ArrowLeft');
    assert.strictEqual(focused(), 'OK');
    press('ArrowRight');
    assert.strictEqual(focused(), 'Cancel');
    press('ArrowDown');
    assert.strictEqual(focused(), 'Other');
    press('End');
    assert.strictEqual(focused(), 'OK');
    press('Home');
    assert.strictEqual(focused(), 'Cancel');
  });

  test('leaves other keys alone', () => {
    const { press, focused, all } = buttons();
    all[0].focus();
    assert.strictEqual(press('Enter'), false);
    assert.strictEqual(press('a'), false);
    assert.strictEqual(focused(), 'Cancel');
  });
});
