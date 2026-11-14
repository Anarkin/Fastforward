import type { Store } from '../../../../../../shell/main/storage';
import {
  bookmarksKey,
  lastFetchesKey,
  remoteTagsKey,
  soloKey,
} from '../../../../../../tools/git/main/storage';
import { gitState } from '../../../../../helpers/harness';

export const keptOf = (store: Store) =>
  [bookmarksKey, remoteTagsKey, lastFetchesKey, soloKey].map((key) =>
    Object.keys(Object(gitState(store).get(key))),
  );

export const keepAll = async (store: Store, roots: readonly string[]) => {
  const each = (value: unknown) =>
    Object.fromEntries(roots.map((root) => [root, value]));
  await gitState(store).update(
    bookmarksKey,
    each([{ kind: 'branch', name: 'main' }]),
  );
  await gitState(store).update(remoteTagsKey, each({ origin: {} }));
  await gitState(store).update(lastFetchesKey, each({ succeeded: 1 }));
  await gitState(store).update(soloKey, each(true));
};
