import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { UserSettings } from '../../../../../shell/main/userSettings';
import { GitPreferences } from '../../../../../tools/git/main/preferences';
import { defaultSettings } from '../../../../helpers/fixtures';

function storageOf(): GitPreferences {
  return new GitPreferences(new UserSettings(defaultSettings()));
}

suite('Git preferences', () => {
  test('lays out a new view as the default settings say', () => {
    const defaults = defaultSettings();
    assert.deepStrictEqual(storageOf().layout, {
      type: 'layout',
      columnWidths: defaults.tools.git.columnWidths,
      defaultColumnWidths: defaults.tools.git.columnWidths,
      collapseMerges: defaults.tools.git.collapseMerges,
      showEntireFile: defaults.tools.git.showEntireFile,
      ignoreWhitespace: defaults.tools.git.ignoreWhitespace,
      diffLayout: defaults.tools.git.diffLayout,
      showAllFiles: defaults.tools.git.showAllFiles,
      autoFetch: defaults.tools.git.autoFetch,
      autoFetchMinutes: defaults.tools.git.autoFetchMinutes,
      hideDimmedButtons: true,
    });
  });

  test('fetches at most every 35791 minutes, as seldom as a timer can wait, and tells the page so, as it says how often it fetches and when a fetch is late by it', () => {
    const storage = new GitPreferences(
      new UserSettings({
        ...defaultSettings(),
        tools: {
          ...defaultSettings().tools,
          git: {
            ...defaultSettings().tools.git,
            autoFetch: true,
            autoFetchMinutes: 50_000,
          },
        },
      }),
    );
    assert.strictEqual(storage.autoFetchMinutes, 35_791);
    assert.strictEqual(
      storage.layout.autoFetchMinutes,
      storage.autoFetchMinutes,
    );
  });
});
