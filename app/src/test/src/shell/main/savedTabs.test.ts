import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { showsSame, type SavedTab } from '../../../../shell/main/savedTabs';

const notes = path.resolve('work', 'notes.txt');
const version = { rev: 'a'.repeat(40), file: notes };

suite('Saved tabs', () => {
  test('takes a tab to show what is asked for when its tool, its file, its version and the files it compares are those asked for, so a tab of a version is never the tab of its file, and a tab of no file and no files compared is never the one asked for', () => {
    const tabs: readonly SavedTab[] = [
      { id: '1', tool: 'viewer', root: notes, version },
      { id: '2', tool: 'viewer', root: notes },
      { id: '3', tool: 'editor', root: notes },
      {
        id: '4',
        tool: 'diff',
        compare: { old: notes, new: notes, oldVersion: version },
      },
      { id: '5', tool: 'terminal' },
    ];
    const found = (wanted: Omit<SavedTab, 'id'>) =>
      tabs.filter((tab) => showsSame(tab, wanted)).map((tab) => tab.id);
    assert.deepStrictEqual(
      [
        found({ tool: 'viewer', root: notes }),
        found({ tool: 'viewer', root: notes, version }),
        found({ tool: 'editor', root: path.join(notes, '..', 'notes.txt') }),
        found({
          tool: 'diff',
          compare: { old: notes, new: notes, oldVersion: version },
        }),
        found({ tool: 'diff', compare: { old: notes, new: notes } }),
        found({ tool: 'terminal' }),
      ],
      [['2'], ['1'], ['3'], ['4'], [], []],
    );
  });
});
