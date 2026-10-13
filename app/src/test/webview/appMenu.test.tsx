import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import type { UpdateStatus } from '../../shared/protocol';
import { AppMenu, updateLabel } from '../../webview/appMenu';
import type { ContextMenuItem } from '../../webview/contextMenu';
import { noop, renderedBy } from '../fixtures';

function menuOf(
  update: UpdateStatus,
  picked: string[],
  autoSortTabs = true,
): { items: readonly ContextMenuItem[]; marked: boolean } {
  const menu = renderedBy(AppMenu, {
    update,
    autoSortTabs,
    onAutoSortTabs: (on) => picked.push(`sort automatically ${on}`),
    onSort: () => picked.push('sort'),
    onOpenSettings: () => picked.push('settings'),
    onOpenDefaultSettings: () => picked.push('defaults'),
    onShowShortcuts: () => picked.push('shortcuts'),
    onCheckForUpdates: () => picked.push('check'),
    onInstallUpdate: () => picked.push('install'),
    onShowAbout: () => picked.push('about'),
  });
  assert.ok(
    isValidElement<{ items: readonly ContextMenuItem[]; marked: boolean }>(
      menu,
    ),
  );
  return menu.props;
}

suite('App menu', () => {
  test('offers sorting the tabs, opening the settings files, showing the shortcuts, checking for updates and the About', () => {
    const picked: string[] = [];
    const items = menuOf({ kind: 'idle' }, picked, false).items.flatMap(
      (item) => ('separator' in item ? [] : [item]),
    );
    assert.deepStrictEqual(
      items.map((item) => item.label),
      [
        'Sort Tabs A-Z Automatically',
        'Sort Tabs A-Z',
        'Open Default Settings',
        'Open User Settings',
        'Keyboard Shortcuts',
        'Check for Updates',
        'About',
      ],
    );
    for (const item of items) {
      item.onClick?.();
    }
    assert.deepStrictEqual(picked, [
      'sort automatically true',
      'sort',
      'defaults',
      'settings',
      'shortcuts',
      'check',
      'about',
    ]);
  });

  test('leaves out sorting the tabs once while they are sorted automatically', () => {
    const labels = menuOf({ kind: 'idle' }, []).items.flatMap((item) =>
      'separator' in item ? [] : [item.label],
    );
    assert.ok(labels.includes('Sort Tabs A-Z Automatically'));
    assert.ok(!labels.includes('Sort Tabs A-Z'));
  });

  test('checks sorting the tabs automatically while it is on, turning it the other way when picked', () => {
    for (const on of [true, false]) {
      const picked: string[] = [];
      const item = menuOf({ kind: 'idle' }, picked, on).items.find(
        (entry) =>
          !('separator' in entry) &&
          entry.label === 'Sort Tabs A-Z Automatically',
      );
      assert.ok(item && !('separator' in item));
      assert.strictEqual(item.checked, on);
      item.onClick?.();
      assert.deepStrictEqual(picked, [`sort automatically ${!on}`]);
    }
  });

  test('opens from a button of three lines, as the menu of the whole app', () => {
    assert.match(
      renderToStaticMarkup(
        <AppMenu
          update={{ kind: 'idle' }}
          autoSortTabs
          onAutoSortTabs={noop}
          onSort={noop}
          onOpenSettings={noop}
          onOpenDefaultSettings={noop}
          onShowShortcuts={noop}
          onCheckForUpdates={noop}
          onInstallUpdate={noop}
          onShowAbout={noop}
        />,
      ),
      /<svg class="icon menu-icon"/,
    );
  });

  test('names the update item after how far updating got', () => {
    assert.deepStrictEqual(
      (
        [
          { kind: 'idle' },
          { kind: 'checking' },
          { kind: 'upToDate' },
          { kind: 'downloading', version: '7.0.0', percent: 42 },
          { kind: 'failed' },
          { kind: 'ready', version: '7.0.0' },
          { kind: 'available', version: '7.0.0' },
        ] as const
      ).map(updateLabel),
      [
        'Check for Updates',
        'Check for Updates (checking...)',
        'Check for Updates (up to date)',
        'Check for Updates (downloading 7.0.0, 42%)',
        'Check for Updates (failed)',
        'Restart to Update to 7.0.0',
        'Download 7.0.0',
      ],
    );
  });

  test('checks for updates from its menu until one is ready, then installs it from there, marking the menu button', () => {
    for (const [update, action, marked] of [
      [{ kind: 'downloading', version: '7.0.0', percent: 42 }, 'check', false],
      [{ kind: 'ready', version: '7.0.0' }, 'install', true],
      [{ kind: 'available', version: '7.0.0' }, 'install', true],
    ] as const) {
      const picked: string[] = [];
      const menu = menuOf(update, picked);
      assert.strictEqual(menu.marked, marked);
      const item = menu.items.findLast(
        (entry) => !('separator' in entry) && entry.label !== 'About',
      );
      assert.ok(item && !('separator' in item));
      item.onClick?.();
      assert.deepStrictEqual(picked, [action]);
    }
  });
});
