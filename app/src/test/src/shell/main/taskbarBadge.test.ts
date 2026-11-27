import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import { taskbarBadgeOf } from '../../../../shell/main/taskbarBadge';
import type { ToolId } from '../../../../shell/shared/tools';

const png = 'data:image/png;base64,iVBORw0KGgo=';

const tabsOf = (...tools: ToolId[]) => tools.map((tool) => ({ tool }));

suite('Taskbar badge', () => {
  test('badges a window whose tabs are all of one tool with the image the page drew, named by the tool for a screen reader', () => {
    assert.deepStrictEqual(
      taskbarBadgeOf('commander', png, tabsOf('commander', 'commander')),
      { png, description: strings.tools.commander },
    );
  });

  test('badges no window holding tabs of another tool than the page names, or none, as the page is not trusted', () => {
    assert.strictEqual(
      taskbarBadgeOf('commander', png, tabsOf('commander', 'terminal')),
      undefined,
    );
    assert.strictEqual(
      taskbarBadgeOf('git', png, tabsOf('commander')),
      undefined,
    );
    assert.strictEqual(taskbarBadgeOf('git', png, []), undefined);
    assert.strictEqual(
      taskbarBadgeOf('browser', png, tabsOf('commander')),
      undefined,
    );
  });

  test('takes only a PNG in a data URL of 64 KB at most, as the main process hands it to the system to decode', () => {
    const tabs = tabsOf('git');
    for (const image of [
      undefined,
      42,
      'data:image/svg+xml,<svg/>',
      'file:///C:/icon.png',
      `${png}\n`,
      `data:image/png;base64,${'A'.repeat(64 * 1024)}`,
    ]) {
      assert.strictEqual(taskbarBadgeOf('git', image, tabs), undefined);
    }
  });

  test('clears the badge once the page names no tool', () => {
    assert.strictEqual(
      taskbarBadgeOf(undefined, undefined, tabsOf('git')),
      undefined,
    );
  });
});
