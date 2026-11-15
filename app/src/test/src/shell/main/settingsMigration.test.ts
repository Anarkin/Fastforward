import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { UserSettings } from '../../../../shell/main/userSettings';
import { defaultSettings } from '../../../helpers/fixtures';
import { removeFolder, tempFolder } from '../../../helpers/tempFolders';

const defaults = defaultSettings();

suite('Settings of version 22', () => {
  let folder: string;
  let file: string;

  beforeEach(() => {
    folder = tempFolder('settings');
    file = path.join(folder, 'settings.user.json');
  });

  afterEach(() => removeFolder(folder));

  const written = (): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));

  test('takes in the settings as version 22 kept them, at the top of the file and with the colors named as they were, saving them where they are kept now', async () => {
    fs.writeFileSync(
      file,
      JSON.stringify({
        collapseMerges: false,
        entireFilePinned: false,
        wordWrap: false,
        showWhitespace: true,
        autoSortTabs: true,
        columnWidths: [400, 200],
        fonts: { size: '13px' },
        colors: {
          dark: {
            foreground: '#eee',
            added: '#123',
            'deleted-row': '10%',
            bubble: '#456',
            'chart-blue': '#789',
          },
        },
      }),
    );
    const user = new UserSettings(defaults, file);
    assert.deepStrictEqual(user.problems, []);
    const { settings } = user;
    assert.strictEqual(settings.tools.git.collapseMerges, false);
    assert.strictEqual(settings.tools.git.showEntireFile, false);
    assert.deepStrictEqual(settings.tools.git.columnWidths, [400, 200]);
    assert.strictEqual(settings.text.wordWrap, false);
    assert.strictEqual(settings.text.showWhitespace, true);
    assert.strictEqual(settings.colors.dark['change-added'], '#123');
    assert.strictEqual(settings.tools.git.colors.dark['graph-blue'], '#789');
    await user.saved();
    assert.deepStrictEqual(written(), {
      text: { wordWrap: false, showWhitespace: true },
      fonts: { size: '13px' },
      tools: {
        git: {
          collapseMerges: false,
          showEntireFile: false,
          columnWidths: [400, 200],
          colors: { dark: { bubble: '#456', 'graph-blue': '#789' } },
        },
      },
      colors: {
        dark: {
          foreground: '#eee',
          'change-added': '#123',
          'change-deleted-row': '10%',
        },
      },
    });
  });

  test('keeps a setting as it is kept now over the one version 22 left at the top of the file, dropping the older', async () => {
    fs.writeFileSync(
      file,
      JSON.stringify({
        wordWrap: true,
        text: { wordWrap: false },
        colors: { light: { added: '#111', 'change-added': '#222' } },
      }),
    );
    const user = new UserSettings(defaults, file);
    assert.strictEqual(user.settings.text.wordWrap, false);
    assert.strictEqual(user.settings.colors.light['change-added'], '#222');
    await user.saved();
    assert.deepStrictEqual(written(), {
      text: { wordWrap: false },
      colors: { light: { 'change-added': '#222' } },
    });
  });
});
