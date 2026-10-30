import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import type { UpdateStatus } from '../../../shell/shared/protocol';
import { AppMenu, updateLabel } from '../../../shell/page/appMenu';
import type { ContextMenuItem } from '../../../ui/contextMenu';
import { noop, renderedBy, stylesheet } from '../../fixtures';

function menuOf(
  update: UpdateStatus,
  picked: string[],
  autoSortTabs = true,
  installsCommand = false,
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
    onInstallCommand: installsCommand ? () => picked.push('ff') : undefined,
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
        'Shortcuts',
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

  test('offers installing ff after the shortcuts where the app installs it itself, on macOS and from an AppImage', () => {
    const picked: string[] = [];
    const items = menuOf({ kind: 'idle' }, picked, true, true).items.flatMap(
      (item) => ('separator' in item ? [] : [item]),
    );
    const labels = items.map((item) => item.label);
    assert.strictEqual(
      labels[labels.indexOf('Shortcuts') + 1],
      'Install the ff Command',
    );
    items.find((item) => item.label === 'Install the ff Command')?.onClick?.();
    assert.deepStrictEqual(picked, ['ff']);
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

  test("opens from the app's icon, as the menu of the whole app", () => {
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
      /^<div class="menu-button"><button [^>]*title="Settings"[^>]*><svg class="title-bar-icon"[^]*<\/svg><\/button><\/div>$/,
    );
  });

  test('drops its menu to the right, from the left end of the tab row', () => {
    assert.match(
      stylesheet(),
      /\.tabs > \.menu-button \.menu \{[^}]*left: 0;[^}]*right: auto;/,
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
