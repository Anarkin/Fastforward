import * as assert from 'node:assert';
import * as path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import type {
  Bookmark,
  BookmarkRef,
} from '../../../../../tools/git/shared/protocol';
import { bookmarksKey } from '../../../../../tools/git/main/storage';
import { FakeStore } from '../../../../helpers/fakeStore';
import { type TempRepository } from '../../../../helpers/repositories';
import { recordingLog, failOnErrorsLogged } from '../../../../helpers/stub';
import {
  type Connection,
  gitState,
  closeViews,
  openView,
  savedBookmarks,
} from '../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
} from '../../../../helpers/gitFixtures';
import { FakePage } from '../../../../helpers/fakePage';
import { removeFolder } from '../../../../helpers/tempFolders';

suite('Git tool keeping bookmarks', () => {
  let folder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    ({ folder, repository, fixture } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  suite('with its tab open', () => {
    let page: FakePage;
    let connection: Connection;
    let store: FakeStore;

    beforeEach(async () => {
      ({ page, connection, store } = await openView(log, [repository.root]));
    });

    afterEach(() => connection.dispose());

    test('makes the main branch a bookmark the first time, and saves the bookmarks the page sets', async () => {
      const main: BookmarkRef = { kind: 'branch', name: 'main' };
      assert.deepStrictEqual(page.last('bookmarks')?.bookmarks, [main]);

      await connection.receive({
        type: 'setBookmarks',
        root: repository.root,
        bookmarks: [],
      });
      assert.deepStrictEqual(savedBookmarks(store, repository.root), []);
    });

    test('saves no bookmarks the page sets in a shape it does not know, or for a repository not open, and saves those for an open one under its own spelling', async () => {
      const main: BookmarkRef = { kind: 'branch', name: 'main' };
      for (const [root, bookmarks] of [
        [repository.root, 'main'],
        [repository.root, [main, { kind: 'branch', name: 1 }]],
        [path.join(folder, 'elsewhere'), [main]],
        [`${repository.root}${path.sep}.`, [main]],
      ]) {
        await connection.receive(
          JSON.parse(JSON.stringify({ type: 'setBookmarks', root, bookmarks })),
        );
      }
      assert.deepStrictEqual(gitState(store).get(bookmarksKey), {
        [repository.root]: [main],
      });
    });

    test('saves of the bookmarks the page sets only their kind and name, and none past the most it keeps, as the page is not trusted', async () => {
      const main: BookmarkRef = { kind: 'branch', name: 'main' };
      const set = (bookmarks: unknown) =>
        connection.receive(
          JSON.parse(
            JSON.stringify({
              type: 'setBookmarks',
              root: repository.root,
              bookmarks,
            }),
          ),
        );
      await set([{ ...main, note: 'kept aside' }]);
      assert.deepStrictEqual(savedBookmarks(store, repository.root), [main]);
      await set(
        Array.from({ length: 1001 }, (_, index) => ({
          kind: 'tag',
          name: `v${index}`,
        })),
      );
      await set([{ kind: 'tag', name: 'v'.repeat(5000) }]);
      assert.deepStrictEqual(savedBookmarks(store, repository.root), [main]);
    });

    test('sends the history again, in place, with the row of a commit bookmarked or no longer bookmarked by hash as one with bubbles or without', async () => {
      const main: BookmarkRef = { kind: 'branch', name: 'main' };
      const setBookmarks = async (bookmarks: readonly Bookmark[]) => {
        page.clear();
        await connection.receive({
          type: 'setBookmarks',
          root: repository.root,
          bookmarks,
        });
        return page.last('commits');
      };
      assert.deepStrictEqual(page.last('commits')?.decorations, [0]);
      await connection.receive({
        type: 'scrolled',
        root: repository.root,
        hash: fixture.b,
        offset: 7,
        report: 1,
      });
      const bookmarked = await setBookmarks([
        main,
        { kind: 'commit', name: fixture.b },
      ]);
      assert.deepStrictEqual(bookmarked?.decorations.toSorted(), [0, 1]);
      assert.deepStrictEqual(bookmarked.scrollTarget, {
        index: 1,
        offset: 7,
        report: 1,
      });
      assert.strictEqual(
        await setBookmarks([
          main,
          { kind: 'commit', name: fixture.b },
          { kind: 'branch', name: 'feature' },
        ]),
        undefined,
      );
      assert.deepStrictEqual((await setBookmarks([main]))?.decorations, [0]);
    });
  });
});
