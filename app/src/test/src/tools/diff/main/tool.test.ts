import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { UserSettings } from '../../../../../shell/main/userSettings';
import { DiffTool } from '../../../../../tools/diff/main/tool';
import { defaultSettings } from '../../../../helpers/fixtures';
import type { Page } from '../../../../../shell/main/toolContract';
import { recordingLog } from '../../../../helpers/stub';

suite('Diff tool', () => {
  test('tells the files a tab compared once it is closed, so a copy taken out of an archive to compare goes once nothing shows it, as the copies of files viewed go', () => {
    const closed: string[] = [];
    const page: Page = { post: () => undefined, disposed: false };
    const tool = new DiffTool({
      log: recordingLog().log,
      userSettings: new UserSettings(defaultSettings()),
      run: () => Promise.reject(new Error('No git is run.')),
      missingGit: () => Promise.resolve(undefined),
      versionCopy: () => Promise.reject(new Error('No version is read.')),
      fileHistory: () => Promise.resolve(undefined),
      decodedCopies: 'decoded',
      codePage: () => Promise.resolve('utf-8'),
      closed: (file) => closed.push(file),
    });

    tool.closed(page, {
      id: '7',
      tool: 'diff',
      compare: { old: 'copies/a/old.txt', new: 'notes.txt' },
    });
    tool.closed(page, { id: '8', tool: 'diff', root: 'repo' });

    assert.deepStrictEqual(closed, ['copies/a/old.txt', 'notes.txt']);
  });
});
