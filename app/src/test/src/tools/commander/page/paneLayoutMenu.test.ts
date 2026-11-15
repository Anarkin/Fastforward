import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { noop } from '../../../../helpers/fixtures';
import { layoutMenu } from '../../../../../tools/commander/page/paneLayoutMenu';

suite('Commander layout menu', () => {
  test('lists the layouts and, past a line, grouping by color, checked while the side groups by it, and only while there are colors to group by', () => {
    const chosen: string[] = [];
    const items = layoutMenu({
      layout: 'thumbnails',
      groupByColor: true,
      canGroupByColor: true,
      onLayout: (layout) => chosen.push(layout),
      onGroupByColor: () => chosen.push('grouped'),
    });
    assert.deepStrictEqual(
      items.map((item) =>
        'separator' in item
          ? '---'
          : [item.label, item.checked ?? false, item.disabled ?? false],
      ),
      [
        [strings.commander.layouts.details, false, false],
        [strings.commander.layouts.thumbnails, true, false],
        '---',
        [strings.commander.groupByColor, true, false],
      ],
    );
    for (const item of items) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(chosen, ['details', 'thumbnails', 'grouped']);

    const none = layoutMenu({
      layout: 'details',
      groupByColor: false,
      canGroupByColor: false,
      onLayout: noop,
      onGroupByColor: noop,
    }).at(-1);
    assert.ok(none !== undefined && !('separator' in none));
    assert.deepStrictEqual([none.checked, none.disabled], [false, true]);
  });
});
