import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { App, menuIn, tabContent } from '../../webview/App';
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

  test('holds the place of the worktree row before the host says which tabs are open', () => {
    const html = renderToStaticMarkup(
      <App name="Fastforward" post={noop} listen={() => noop} />,
    );
    assert.strictEqual(tagsWith(html, 'worktrees').length, 1);
    assert.strictEqual(tagsWith(html, 'skeleton-tab').length, 1);
  });

  test('closes a menu once another worktree is shown, as its items act on the one it opened in', () => {
    const menu = { x: 1, y: 2, items: [] };
    const opened = { root: '/a', menu };
    assert.strictEqual(menuIn(opened, '/a'), menu);
    assert.strictEqual(menuIn(opened, '/b'), undefined);
    assert.strictEqual(menuIn(opened, undefined), undefined);
    assert.strictEqual(menuIn({ root: undefined, menu }, undefined), menu);
    assert.strictEqual(menuIn(undefined, '/a'), undefined);
  });
});
