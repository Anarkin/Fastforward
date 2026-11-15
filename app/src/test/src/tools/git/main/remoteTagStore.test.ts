import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { Store } from '../../../../../shell/main/stateFile';
import {
  RemoteTagStore,
  remoteTagsKey,
} from '../../../../../tools/git/main/remoteTagStore';
import { FakeStore } from '../../../../helpers/fakeStore';

function storageOf(state: Store = new FakeStore()): RemoteTagStore {
  return new RemoteTagStore(state);
}

suite('Remote tag store', () => {
  test('parses the tags of the remotes of a repository once until they change, as each refresh reads them', async () => {
    const storage = storageOf();
    const root = path.resolve('r');
    const [a, b] = ['a', 'b'].map((digit) => digit.repeat(40));
    await storage.setRemoteTags(root, 'origin', new Map([['v1', a]]));
    await storage.setRemoteTags(root, 'upstream', new Map([['v1', a]]));
    const read = storage.remoteTagsOf(root);
    assert.strictEqual(
      storage.remoteTagsOf(root).get('origin'),
      read.get('origin'),
    );
    await storage.setRemoteTags(root, 'upstream', new Map([['v2', b]]));
    const changed = storage.remoteTagsOf(root);
    assert.strictEqual(changed.get('origin'), read.get('origin'));
    assert.deepStrictEqual(changed.get('upstream'), new Map([['v2', b]]));
  });

  test('keeps the tags each remote of a repository had when last listed, for the next start, dropping remotes no longer there', async () => {
    const state = new FakeStore();
    const storage = storageOf(state);
    const root = path.resolve('r');
    const [a, b] = ['a', 'b'].map((digit) => digit.repeat(40));
    assert.deepStrictEqual(storage.remoteTagsOf(root), new Map());
    await storage.setRemoteTags(root, 'origin', new Map([['v1', a]]));
    await storage.setRemoteTags(root, 'upstream', new Map([['v2', b]]));
    await storage.keepRemoteTags(root, ['origin']);
    assert.deepStrictEqual(
      storageOf(state).remoteTagsOf(root),
      new Map([['origin', new Map([['v1', a]])]]),
    );
    assert.deepStrictEqual(
      storage.remoteTagsOf(path.resolve('other')),
      new Map(),
    );
  });

  test('reads remote tags of the wrong shape, as a hand edit can leave them, leaving out what is not a tag and its commit', async () => {
    const state = new FakeStore();
    const root = path.resolve('r');
    const c = 'c'.repeat(40);
    await state.update(remoteTagsKey, {
      [root]: { origin: { v1: 5, v2: c, v3: 'not a hash' }, junk: 'x' },
    });
    assert.deepStrictEqual(
      storageOf(state).remoteTagsOf(root),
      new Map([['origin', new Map([['v2', c]])]]),
    );
  });
});
