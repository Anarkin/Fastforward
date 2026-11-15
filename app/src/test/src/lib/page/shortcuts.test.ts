import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { shellKeymap } from '../../../../shell/shared/keymap';
import { gitKeymap } from '../../../../tools/git/page/keymap';
import { appKeyPressed, keyPressed } from '../../../../lib/page/shortcuts';
import { element } from '../../../helpers/fixtures';
import { keyPress } from '../../../helpers/keys';

const within = (inMenu: boolean) =>
  Object.assign(element('BUTTON'), {
    closest: (selector: string) =>
      inMenu && selector === '.menu' ? element('DIV') : null,
  });

suite('Keyboard shortcuts', () => {
  test('leaves keys typed into a field to the field', () => {
    for (const target of [
      element('INPUT'),
      element('TEXTAREA'),
      element('SELECT'),
      element('DIV', true),
    ]) {
      assert.strictEqual(
        keyPressed(gitKeymap.commits, keyPress('c', { target })),
        undefined,
      );
    }
    assert.strictEqual(
      keyPressed(
        gitKeymap.commits,
        keyPress('c', { target: element('BUTTON') }),
      ),
      true,
    );
  });

  test('leaves the keys pressed alone in an open menu to the menu, rather than acting on the app behind it, as C hid the commit list from a context menu, but not those pressed with Ctrl, Cmd or Alt, as Ctrl+T closes the menu it opened', () => {
    assert.strictEqual(
      appKeyPressed(gitKeymap.commits, keyPress('c', { target: within(true) })),
      undefined,
    );
    assert.strictEqual(
      appKeyPressed(
        shellKeymap.shortcuts,
        keyPress('F1', { target: within(true) }),
      ),
      undefined,
    );
    assert.strictEqual(
      appKeyPressed(
        gitKeymap.commits,
        keyPress('c', { target: within(false) }),
      ),
      true,
    );
    assert.strictEqual(
      appKeyPressed(
        gitKeymap.find,
        keyPress('f', { code: 'KeyF', ctrlKey: true, target: within(true) }),
      ),
      true,
    );
  });

  test('leaves every key pressed in a modal dialog to the dialog, rather than acting on the app behind it, as C hid the commit list behind the About popup', () => {
    const inDialog = Object.assign(element('BUTTON'), {
      closest: (selector: string) =>
        selector === "[aria-modal='true']" ? element('DIV') : null,
    });
    assert.strictEqual(
      appKeyPressed(gitKeymap.commits, keyPress('c', { target: inDialog })),
      undefined,
    );
    assert.strictEqual(
      appKeyPressed(
        gitKeymap.find,
        keyPress('f', { code: 'KeyF', ctrlKey: true, target: inDialog }),
      ),
      undefined,
    );
  });

  test('closes the shortcuts with F1 or ? pressed inside their own dialog, as they opened', () => {
    const inDialog = Object.assign(element('DIV'), {
      closest: (selector: string) =>
        selector === "[aria-modal='true']" ? element('DIV') : null,
    });
    assert.strictEqual(
      appKeyPressed(
        shellKeymap.shortcuts,
        keyPress('F1', { target: inDialog }),
      ),
      true,
    );
    assert.strictEqual(
      appKeyPressed(shellKeymap.shortcuts, keyPress('?', { target: inDialog })),
      true,
    );
  });
});
