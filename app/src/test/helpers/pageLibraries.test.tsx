import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { mounted } from './mounted';
import { letGoOfThePointer } from './pageLibraries';

suite('The libraries of the page in the tests', () => {
  test('hands the animation and transition events to their handlers in a window of jsdom without AnimationEvent or TransitionEvent, as React DOM names the events it listens for once, from the window it loads in, and the file that loaded it first decided for every file after it', async () => {
    const ended: string[] = [];
    await mounted(
      <div
        className="moving"
        onAnimationEnd={() => ended.push('animation')}
        onTransitionEnd={() => ended.push('transition')}
      />,
      (main, window) => {
        assert.strictEqual('AnimationEvent' in window, false);
        const moving = main.querySelector('.moving');
        assert.ok(moving);
        for (const type of ['animationend', 'transitionend']) {
          moving.dispatchEvent(new window.Event(type, { bubbles: true }));
        }
      },
    );
    assert.deepStrictEqual(ended, ['animation', 'transition']);
  });

  test('gives the DOMPurify the page shares a window, as the page does, so its hooks can be added whichever file loaded it first, as one loaded without a window was a stub without them for every file after it', async () => {
    const { default: shared } = await import('dompurify');
    assert.strictEqual(shared.isSupported, true);
    assert.strictEqual(typeof shared.addHook, 'function');
  });

  test('lets go of the pointer a file before pressed and never let go of, as React DOM keeps the pointer pressed for every file after it and selects nothing in them', async () => {
    const selected: string[] = [];
    await mounted(
      <input
        defaultValue="notes.pdf"
        onSelect={() => selected.push('select')}
      />,
      (main, window) => {
        const field = main.querySelector('input');
        assert.ok(field);
        field.dispatchEvent(
          new window.MouseEvent('mousedown', { bubbles: true }),
        );
        letGoOfThePointer();
        field.focus();
        field.setSelectionRange(1, 1);
        field.dispatchEvent(
          new window.KeyboardEvent('keyup', { bubbles: true }),
        );
      },
    );
    assert.deepStrictEqual(selected, ['select']);
  });
});
