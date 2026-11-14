import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  clicked,
  hovered,
  pressed,
  type KeyPress,
} from '../../../../../lib/shared/keymap';
import { gitKeymap } from '../../../../../tools/git/page/keymap';
import {
  keyPress,
  noModifiers,
  withMacKeys,
} from '../../../../helpers/fixtures';

const altNavigate = (key: string, inField = false) =>
  pressed(gitKeymap.navigate, keyPress(key, { altKey: true }), inField);

const worktreeStep = (extra: Partial<KeyPress>) =>
  pressed(
    gitKeymap.worktree,
    keyPress('PageDown', { ctrlKey: true, ...extra }),
    false,
  );

suite('Keymap of git', () => {
  test('goes to the next worktree on Ctrl+PageDown, and the previous on Ctrl+PageUp', () => {
    assert.strictEqual(worktreeStep({}), 1);
    assert.strictEqual(worktreeStep({ key: 'PageUp' }), -1);
    assert.strictEqual(worktreeStep({ ctrlKey: false }), undefined);
    assert.strictEqual(worktreeStep({ shiftKey: true }), undefined);
    assert.strictEqual(worktreeStep({ altKey: true }), undefined);
    assert.strictEqual(worktreeStep({ metaKey: true }), undefined);
    assert.strictEqual(worktreeStep({ key: 'Tab' }), undefined);
  });

  test('steps through the commits with Alt+↑ and Alt+↓, held down too, showing each whole message as Alt stays held', () => {
    assert.strictEqual(
      pressed(gitKeymap.peekStep, keyPress('ArrowUp', { altKey: true }), false),
      'up',
    );
    assert.strictEqual(
      pressed(
        gitKeymap.peekStep,
        keyPress('ArrowDown', { altKey: true, repeat: true }),
        false,
      ),
      'down',
    );
  });

  test('selects the first parent on Ctrl+↓, or Cmd+↓ on macOS, where Ctrl+↓ shows the windows of the app, leaving Alt+↓ to stepping through the commits', () => {
    const modDown = keyPress('ArrowDown', { ctrlKey: true });
    assert.strictEqual(pressed(gitKeymap.parent, modDown, false), true);
    assert.strictEqual(
      withMacKeys(() =>
        pressed(
          gitKeymap.parent,
          keyPress('ArrowDown', { metaKey: true }),
          false,
        ),
      ),
      true,
    );
    assert.strictEqual(
      pressed(gitKeymap.parent, keyPress('ArrowDown', { altKey: true }), false),
      undefined,
    );
  });

  test('shows the whole message of a commit hovered with Alt alone, or Option on macOS, but never on a key press', () => {
    const alt = { ...noModifiers, altKey: true };
    assert.strictEqual(hovered(gitKeymap.message, alt), true);
    assert.strictEqual(
      withMacKeys(() => hovered(gitKeymap.message, alt)),
      true,
    );
    assert.strictEqual(hovered(gitKeymap.message, noModifiers), undefined);
    for (const held of ['ctrlKey', 'metaKey', 'shiftKey']) {
      assert.strictEqual(
        hovered(gitKeymap.message, { ...alt, [held]: true }),
        undefined,
        held,
      );
    }
    assert.strictEqual(
      pressed(gitKeymap.message, keyPress('Hover', alt), false),
      undefined,
    );
  });

  test('pins the whole message of a commit on a click with Alt alone, or Option on macOS', () => {
    const click = { button: 0, ...noModifiers, altKey: true };
    assert.strictEqual(clicked(gitKeymap.pin, click), true);
    assert.strictEqual(
      withMacKeys(() => clicked(gitKeymap.pin, click)),
      true,
    );
    assert.strictEqual(
      clicked(gitKeymap.pin, { ...click, altKey: false }),
      undefined,
    );
    assert.strictEqual(
      clicked(gitKeymap.pin, { ...click, shiftKey: true }),
      undefined,
    );
    assert.strictEqual(
      clicked(gitKeymap.pin, { ...click, button: 2 }),
      undefined,
    );
  });

  test('goes back or forward on Alt+← and Alt+→, as the mouse buttons do, but leaves them to the caret in a field', () => {
    assert.strictEqual(altNavigate('ArrowLeft'), 'back');
    assert.strictEqual(altNavigate('ArrowRight'), 'forward');
    assert.strictEqual(altNavigate('ArrowLeft', true), undefined);
    assert.strictEqual(
      clicked(gitKeymap.navigate, { button: 3, ...noModifiers }),
      'back',
    );
  });

  test('pins the whole message of the selected commit on Alt+Enter, or Option+Enter on macOS, but not on Enter alone', () => {
    const altEnter = keyPress('Enter', { altKey: true });
    assert.strictEqual(pressed(gitKeymap.pin, altEnter, false), true);
    assert.strictEqual(
      withMacKeys(() => pressed(gitKeymap.pin, altEnter, false)),
      true,
    );
    assert.strictEqual(
      pressed(gitKeymap.pin, keyPress('Enter'), false),
      undefined,
    );
    assert.strictEqual(
      pressed(gitKeymap.pin, keyPress('Click', { altKey: true }), false),
      undefined,
    );
  });
});
