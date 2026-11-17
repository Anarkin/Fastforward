import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { act } from 'react';
import { PathName } from '../../../../../lib/page/pathName';
import {
  PathMenuContext,
  type PathMenuAsk,
} from '../../../../../lib/page/pathMenu';
import { createGitStore, GitStore } from '../../../../../tools/git/page/store';
import { VersionedPaths } from '../../../../../tools/git/page/versionedPaths';
import {
  emptyTabView,
  type TabView,
} from '../../../../../tools/git/page/shownTab';
import { CommitHistory } from '../../../../../tools/git/page/commitHistory';
import type {
  FileChange,
  GitToHost,
} from '../../../../../tools/git/shared/protocol';
import { workingTreeHash } from '../../../../../lib/shared/changes';
import { fileChange } from '../../../../helpers/gitValues';
import { mounted } from '../../../../helpers/mounted';

const commit = '0123456789abcdef0123456789abcdef01234567';

async function asked(hash: string, change: FileChange) {
  const posted: GitToHost[] = [];
  const asks: PathMenuAsk[] = [];
  const tab: TabView = {
    ...emptyTabView,
    root: '/repo',
    history: new CommitHistory(0),
    hash,
    files: [change],
  };
  const store = createGitStore((message) => posted.push(message), { tab });
  await mounted(
    <GitStore value={store}>
      <PathMenuContext value={(ask) => asks.push(ask)}>
        <VersionedPaths>
          <PathName path={change.path} file root="/repo" />
        </VersionedPaths>
      </PathMenuContext>
    </GitStore>,
    (main, window) => {
      act(() => {
        for (const part of main.querySelectorAll('.path-part')) {
          part.dispatchEvent(
            new window.MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              button: 2,
            }),
          );
        }
      });
    },
  );
  const [folder, ask] = asks;
  ask?.version?.view?.();
  return { folder, ask, posted };
}

suite('Versioned paths of git', () => {
  test('hands the menu of a file a commit shows the version it shows it as, viewing it at that version, and its folders none', async () => {
    const { folder, ask, posted } = await asked(
      commit,
      fileChange('src/gone.ts', { status: 'D' }),
    );
    assert.strictEqual(ask?.path, '/repo/src/gone.ts');
    assert.deepStrictEqual(
      [folder?.path, folder !== undefined && Object.hasOwn(folder, 'version')],
      ['/repo/src', false],
    );
    assert.deepStrictEqual(posted, [
      {
        type: 'viewFile',
        root: '/repo',
        path: 'src/gone.ts',
        rev: `${commit}^`,
      },
    ]);
  });

  test('hands the menu of a file of the working tree none, so it acts on the file on disk', async () => {
    const { ask, posted } = await asked(
      workingTreeHash,
      fileChange('src/kept.ts'),
    );
    assert.strictEqual(ask?.path, '/repo/src/kept.ts');
    assert.ok(!Object.hasOwn(ask, 'version'));
    assert.deepStrictEqual(posted, []);
  });
});
