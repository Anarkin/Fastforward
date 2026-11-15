import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { ToolId } from '../../../../shell/shared/tools';
import { strings } from '../../../../lib/shared/strings';
import { noop } from '../../../helpers/fixtures';
import { newTabItems, tabMenuItems } from '../../../../shell/page/tabMenus';

suite('Menu of the + button', () => {
  test('offers every tool in the + menu by name, with its icon, as a submenu where the tool gives one, or opening a new tab of it', () => {
    const opened: ToolId[] = [];
    const recent = [{ label: 'main', onClick: noop }];
    const items = newTabItems({ git: recent }, (tool) => opened.push(tool));
    assert.deepStrictEqual(
      items.map((item) => ('label' in item ? item.label : undefined)),
      [strings.tools.terminal, strings.tools.commander, strings.tools.git],
    );
    const [, files, git] = items;
    assert.ok(git && 'label' in git && files && 'label' in files);
    assert.strictEqual(git.submenu, recent);
    assert.ok(git.icon !== undefined && files.icon !== undefined);
    files.onClick?.();
    assert.deepStrictEqual(opened, ['commander']);
  });
});

suite('Menu of a tab', () => {
  test('moves the tab to a new window, unless it is the only tab of its window, or into another window named after the tab it shows', () => {
    const moved: (readonly [string, string | undefined])[] = [];
    const move = (tab: string, window?: string) => moved.push([tab, window]);
    const items = tabMenuItems(
      '4',
      false,
      [
        { id: '2', name: 'repo' },
        { id: '3', name: strings.tabs.noTabWindow },
      ],
      move,
    );
    assert.deepStrictEqual(
      items.map((item) =>
        'separator' in item
          ? '-'
          : [
              item.label,
              item.disabled === true,
              item.submenu?.map((each) =>
                'separator' in each ? '-' : each.label,
              ),
            ],
      ),
      [
        ['Move to New Window', false, undefined],
        ['Move to Window', false, ['repo', 'Window with no tab']],
      ],
    );
    for (const item of items) {
      if (!('separator' in item)) {
        item.onClick?.();
        for (const each of item.submenu ?? []) {
          if (!('separator' in each)) {
            each.onClick?.();
          }
        }
      }
    }
    assert.deepStrictEqual(moved, [
      ['4', undefined],
      ['4', '2'],
      ['4', '3'],
    ]);
  });

  test('offers no other window while there is none, and no new window for the only tab of a window', () => {
    const [only, ...rest] = tabMenuItems('1', true, [], () => 0);
    assert.ok(only && !('separator' in only));
    assert.strictEqual(only.disabled, true);
    assert.deepStrictEqual(rest, []);
  });
});
