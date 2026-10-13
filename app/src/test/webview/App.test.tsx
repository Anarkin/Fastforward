import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { App, menuIn, nextMenu, tabContent } from '../../webview/App';
import { noop, tagsWith } from '../fixtures';

const columns = () => 'columns';

suite('Window', () => {
  test('says no repository is open only once the host says which tabs are', () => {
    const html = renderToStaticMarkup(
      <App name="Fastforward" post={noop} listen={() => noop} />,
    );
    assert.strictEqual(tagsWith(html, 'tabs').length, 1);
    assert.doesNotMatch(html, /No repository is open/);
    assert.strictEqual(tabContent(undefined, columns), null);
    assert.strictEqual(
      renderToStaticMarkup(<>{tabContent([], columns)}</>),
      '<div class="empty-state">No repository is open. Use + to open one.</div>',
    );
    assert.strictEqual(
      tabContent([{ root: '/repo', name: 'repo' }], columns),
      'columns',
    );
  });

  test('shows no worktree row before the host says which worktrees there are', () => {
    const html = renderToStaticMarkup(
      <App name="Fastforward" post={noop} listen={() => noop} />,
    );
    assert.strictEqual(tagsWith(html, 'worktrees').length, 0);
  });

  test('closes a menu once another worktree is shown, as its items act on the one it opened in', () => {
    const menu = { x: 1, y: 2, items: [] };
    const opened = { root: '/a', menu, id: 1 };
    assert.strictEqual(menuIn(opened, '/a'), menu);
    assert.strictEqual(menuIn(opened, '/b'), undefined);
    assert.strictEqual(menuIn(opened, undefined), undefined);
    assert.strictEqual(
      menuIn({ root: undefined, menu, id: 1 }, undefined),
      menu,
    );
    assert.strictEqual(menuIn(undefined, '/a'), undefined);
  });

  test('opens each menu anew, so one opened over another, as the repositories over a commit menu, takes the focus and none of its submenus', () => {
    const menu = { x: 1, y: 2, items: [] };
    const first = nextMenu(undefined, '/a', menu);
    const second = nextMenu(first, '/a', menu);
    assert.notStrictEqual(first.id, second.id);
    assert.notStrictEqual(nextMenu(undefined, '/a', menu).id, second.id);
  });
});
