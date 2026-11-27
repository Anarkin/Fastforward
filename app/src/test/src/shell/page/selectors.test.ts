import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { TabInfo } from '../../../../shell/shared/protocol';
import type { ToolId } from '../../../../shell/shared/tools';
import { soleToolOf } from '../../../../shell/page/selectors';

const tab = (id: string, tool: ToolId): TabInfo => ({ id, tool, name: id });

suite('Shell selectors', () => {
  test('takes the tool every tab of the window is of, and none for a window of several tools, of none, or whose tabs are not known yet', () => {
    assert.strictEqual(
      soleToolOf({ tabs: [tab('1', 'git'), tab('2', 'git')] }),
      'git',
    );
    assert.strictEqual(
      soleToolOf({ tabs: [tab('1', 'git'), tab('2', 'terminal')] }),
      undefined,
    );
    assert.strictEqual(soleToolOf({ tabs: [] }), undefined);
    assert.strictEqual(soleToolOf({ tabs: undefined }), undefined);
  });
});
