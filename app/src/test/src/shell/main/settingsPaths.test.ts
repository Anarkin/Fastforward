import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { overridesOf } from '../../../../shell/main/settingsPaths';
import { defaultSettings } from '../../../helpers/fixtures';

const defaults = defaultSettings();

suite('Settings', () => {
  test('keeps only what differs from the defaults as the user settings', () => {
    assert.deepStrictEqual(
      overridesOf(defaults, {
        ...defaults,
        tools: {
          ...defaults.tools,
          git: {
            ...defaults.tools.git,
            solo: true,
            columnWidths: [...defaults.tools.git.columnWidths],
          },
        },
      }),
      { tools: { git: { solo: true } } },
    );
  });
});
