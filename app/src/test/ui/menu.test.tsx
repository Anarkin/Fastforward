import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { MenuButton } from '../../ui/menu';

suite('Menu button', () => {
  test('tells assistive technology it opens a menu, and that the menu is closed', () => {
    const trigger = new JSDOM(
      renderToStaticMarkup(<MenuButton title="Settings" items={[]} />),
    ).window.document.querySelector('button');
    assert.strictEqual(trigger?.getAttribute('aria-haspopup'), 'menu');
    assert.strictEqual(trigger.getAttribute('aria-expanded'), 'false');
  });
});
