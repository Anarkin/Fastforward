import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { strings } from '../../../shared/strings';
import type { ToolId } from '../../../shell/shared/tools';
import {
  App,
  emptyState,
  menuIn,
  newTabItems,
  nextMenu,
} from '../../../shell/page/App';
import { noop, tagsWith } from '../../fixtures';

suite('Window', () => {
  test('says no tab is open only once the host says which tabs are', () => {
    const html = renderToStaticMarkup(
      <App name="Fastforward" post={noop} listen={() => noop} />,
    );
    assert.strictEqual(tagsWith(html, 'tabs').length, 1);
    assert.doesNotMatch(html, /No tab is open/);
    assert.strictEqual(emptyState(undefined), null);
    assert.strictEqual(
      renderToStaticMarkup(<>{emptyState([])}</>),
      '<div class="empty-state">No tab is open. Use + to open one. The app menu is at the top right.</div>',
    );
    assert.strictEqual(
      emptyState([{ id: '1', tool: 'files', name: strings.tools.files }]),
      null,
    );
  });

  test("tops the window with the tab row, starting with the app's icon and ending with its menu, and shows no title bar", () => {
    const html = renderToStaticMarkup(
      <App name="Fastforward" post={noop} listen={() => noop} />,
    );
    assert.strictEqual(tagsWith(html, 'title-bar').length, 0);
    assert.match(
      html,
      /^<div class="app"><nav class="tabs"[^>]*><svg class="title-bar-icon"[^]*<\/svg><div class="tab-list"[^]*<\/div><div class="menu-button"[^]*<\/nav>/,
    );
  });

  test('shows no worktree row before the host says which tab is open', () => {
    const html = renderToStaticMarkup(
      <App name="Fastforward" post={noop} listen={() => noop} />,
    );
    assert.strictEqual(tagsWith(html, 'worktrees').length, 0);
  });

  test('closes a menu once another tab is shown, as its items act on the one it opened in', () => {
    const menu = { x: 1, y: 2, items: [] };
    const opened = { tab: '1', menu, id: 1 };
    assert.strictEqual(menuIn(opened, '1'), menu);
    assert.strictEqual(menuIn(opened, '2'), undefined);
    assert.strictEqual(menuIn(opened, undefined), undefined);
    assert.strictEqual(
      menuIn({ tab: undefined, menu, id: 1 }, undefined),
      menu,
    );
    assert.strictEqual(menuIn(undefined, '1'), undefined);
  });

  test('opens each menu anew, so one opened over another, as the + menu over a commit menu, takes the focus and none of its submenus', () => {
    const menu = { x: 1, y: 2, items: [] };
    const first = nextMenu(undefined, '1', menu);
    const second = nextMenu(first, '1', menu);
    assert.notStrictEqual(first.id, second.id);
    assert.notStrictEqual(nextMenu(undefined, '1', menu).id, second.id);
  });

  test('offers every tool in the + menu by name, with its icon, as a submenu where the tool gives one, or opening a new tab of it', () => {
    const opened: ToolId[] = [];
    const recent = [{ label: 'main', onClick: noop }];
    const items = newTabItems({ git: recent }, (tool) => opened.push(tool));
    assert.deepStrictEqual(
      items.map((item) => ('label' in item ? item.label : undefined)),
      [strings.tools.git, strings.tools.files, strings.tools.terminal],
    );
    const [git, files] = items;
    assert.ok(git && 'label' in git && files && 'label' in files);
    assert.strictEqual(git.submenu, recent);
    assert.ok(git.icon !== undefined && files.icon !== undefined);
    files.onClick?.();
    assert.deepStrictEqual(opened, ['files']);
  });
});
