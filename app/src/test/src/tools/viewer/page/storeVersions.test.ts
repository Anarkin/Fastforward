import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { ViewerToHost } from '../../../../../tools/viewer/shared/protocol';
import { createViewerStore } from '../../../../../tools/viewer/page/store';

const hash = '0123456789abcdef0123456789abcdef01234567';

const listed = {
  versions: [
    { rev: hash, path: '/work/a.txt', date: 1000, subject: 'one', gone: false },
  ],
  staged: false,
  onDisk: true,
  changed: false,
};

function viewerStore() {
  const posted: ViewerToHost[] = [];
  const store = createViewerStore((message) => posted.push(message));
  return { posted, store };
}

suite('Viewer store versions', () => {
  test('keeps which version of its file the tab shown shows, and the versions listed of each tab, forgetting them once the tab closes', () => {
    const { store } = viewerStore();
    const { receive } = store.getState();
    receive({ type: 'show', tab: '1', file: '/work/a.txt', version: hash });
    receive({ type: 'versions', tab: '1', ...listed });
    assert.strictEqual(store.getState().version, hash);
    assert.deepStrictEqual(store.getState().versions.get('1'), listed);

    receive({ type: 'show', tab: '2', file: '/work/b.txt' });
    assert.strictEqual(store.getState().version, undefined);
    assert.deepStrictEqual(store.getState().versions.get('1'), listed);
    receive({ type: 'closed', tab: '1' });
    assert.strictEqual(store.getState().versions.has('1'), false);
  });

  test('drops what a tab showed once it shows another version of its file, as the main process views that anew', () => {
    const { store } = viewerStore();
    const { receive } = store.getState();
    receive({ type: 'show', tab: '1', file: '/work/a.txt' });
    receive({ type: 'viewing', tab: '1', size: 3, version: 'on disk' });
    assert.notStrictEqual(store.getState().viewed, undefined);

    receive({ type: 'show', tab: '1', file: '/work/a.txt', version: hash });
    assert.strictEqual(store.getState().viewed, undefined);
  });

  test('asks the main process to show the version chosen of the file of the tab shown, or the file on disk', () => {
    const { posted, store } = viewerStore();
    store.getState().receive({ type: 'show', tab: '1', file: '/work/a.txt' });
    store.getState().chooseVersion(hash);
    store.getState().chooseVersion(undefined);
    assert.deepStrictEqual(posted, [
      { type: 'chooseVersion', tab: '1', rev: hash },
      { type: 'chooseVersion', tab: '1' },
    ]);
  });

  test('asks the main process to compare the version of the tab shown with the one before it, and nothing while no tab shows', () => {
    const { posted, store } = viewerStore();
    store.getState().compareVersions();
    store.getState().receive({ type: 'show', tab: '1', file: '/work/a.txt' });
    store.getState().compareVersions();
    assert.deepStrictEqual(posted, [{ type: 'compareVersions', tab: '1' }]);
  });
});
