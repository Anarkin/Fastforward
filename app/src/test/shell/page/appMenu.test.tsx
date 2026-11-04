import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import type { UpdateStatus } from '../../../shell/shared/protocol';
import { AppMenu, updateLabel } from '../../../shell/page/appMenu';
import type { ContextMenuItem } from '../../../ui/contextMenu';
import { allWithClass, cascaded, rendered } from '../../cascade';
import { noop, renderedBy } from '../../fixtures';

function menuOf(
  update: UpdateStatus,
  picked: string[],
  installsCommand = false,
): { items: readonly ContextMenuItem[]; marked: boolean } {
  const menu = renderedBy(AppMenu, {
    update,
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
  test('offers opening the settings files, then checking for updates, the shortcuts and the About in a group of their own', () => {
    const picked: string[] = [];
    const { items } = menuOf({ kind: 'idle' }, picked);
    assert.deepStrictEqual(
      items.map((item) => ('separator' in item ? '-' : item.label)),
      [
        'Open Default Settings',
        'Open User Settings',
        '-',
        'Check for Updates',
        'Shortcuts',
        'About',
      ],
    );
    for (const item of items) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(picked, [
      'defaults',
      'settings',
      'check',
      'shortcuts',
      'about',
    ]);
  });

  test('offers installing ff after checking for updates where the app installs it itself, on macOS and from an AppImage', () => {
    const picked: string[] = [];
    const items = menuOf({ kind: 'idle' }, picked, true).items.flatMap(
      (item) => ('separator' in item ? [] : [item]),
    );
    const labels = items.map((item) => item.label);
    assert.strictEqual(
      labels[labels.indexOf('Check for Updates') + 1],
      'Install the ff Command',
    );
    items.find((item) => item.label === 'Install the ff Command')?.onClick?.();
    assert.deepStrictEqual(picked, ['ff']);
  });

  test("opens from the app's icon, as the menu of the whole app", () => {
    assert.match(
      renderToStaticMarkup(
        <AppMenu
          update={{ kind: 'idle' }}
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

  test('drops its menu to the right, from the left end of the tab row, opening its submenus beside it rather than over it', () => {
    const bar = rendered(
      <nav className="tabs">
        <div className="menu-button">
          <div className="menu">
            <div className="menu submenu" />
            <div className="menu submenu flipped" />
          </div>
        </div>
      </nav>,
    );
    const [menu, submenu, flipped] = allWithClass(bar, 'menu');
    assert.deepStrictEqual(
      [menu, submenu, flipped].map((element) => [
        cascaded(element, 'left'),
        cascaded(element, 'right'),
      ]),
      [
        ['0', 'auto'],
        ['100%', 'auto'],
        ['auto', '100%'],
      ],
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
      const item = menu.items.find(
        (entry) =>
          !('separator' in entry) && entry.label === updateLabel(update),
      );
      assert.ok(item && !('separator' in item));
      item.onClick?.();
      assert.deepStrictEqual(picked, [action]);
    }
  });
});
