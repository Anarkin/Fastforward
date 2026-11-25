import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { ContextMenuItem } from '../../../../../lib/page/contextMenuItem';
import { leavesOf } from '../../../../../lib/page/menuFilter';
import type { RefInfo } from '../../../../../tools/git/shared/protocol';
import { placesMenu } from '../../../../../tools/git/page/placesMenu';
import { indexRefs } from '../../../../../tools/git/page/refIndex';

const ref = (kind: RefInfo['kind'], name: string, commit: string): RefInfo => ({
  kind,
  name,
  commit,
});

const refs = [
  ref('branch', 'main', 'm'),
  ref('branch', 'topic', 't'),
  ref('branch', 'topic/menu', 'tm'),
  ref('remote', 'origin/main', 'om'),
  ref('tag', 'v1', 'v'),
];

const labels = (items: readonly ContextMenuItem[] | undefined) =>
  (items ?? []).map((item) => ('separator' in item ? '-' : item.label));

const named = (items: readonly ContextMenuItem[] | undefined, label: string) =>
  (items ?? []).find((item) => !('separator' in item) && item.label === label);

suite('Places menu', () => {
  const jumped: string[] = [];
  const menu = placesMenu(
    {
      bookmarks: [
        { kind: 'branch', name: 'main' },
        { kind: 'commit', name: 'abcdef1234' },
        { kind: 'branch', name: 'gone' },
      ],
      refs,
      groups: indexRefs(refs),
      stashes: [{ name: 'stash@{0}', commit: 's', message: 'WIP on main' }],
    },
    (commit) => jumped.push(commit),
  );

  test('lists the bookmarks, the local branches, the remote branches, the tags and the stashes, each a submenu with a filter, none of them empty but disabled', () => {
    assert.deepStrictEqual(labels(menu), [
      'Bookmarks',
      'Local branches',
      'Remote branches',
      'Tags',
      'Stashes',
    ]);
    for (const item of menu) {
      assert.ok(!('separator' in item) && item.filtered === true);
    }
    const empty = placesMenu(
      { bookmarks: [], refs: [], groups: indexRefs([]), stashes: [] },
      () => {},
    );
    assert.deepStrictEqual(
      empty.map((item) => !('separator' in item) && item.disabled),
      [true, true, true, true, true],
    );
  });

  test('nests the branches in folders by their slashes, a branch named as a folder first inside it, and finds each by its whole name', () => {
    const local = named(menu, 'Local branches');
    assert.ok(local && !('separator' in local));
    assert.deepStrictEqual(labels(local.submenu), ['topic', 'main']);
    const topic = named(local.submenu, 'topic');
    assert.ok(topic && !('separator' in topic));
    assert.deepStrictEqual(labels(topic.submenu), ['topic', 'menu']);
    assert.deepStrictEqual(labels(leavesOf(local.submenu ?? [])), [
      'topic',
      'topic/menu',
      'main',
    ]);
    const remote = named(menu, 'Remote branches');
    assert.ok(remote && !('separator' in remote));
    assert.deepStrictEqual(labels(leavesOf(remote.submenu ?? [])), [
      'origin/main',
    ]);
  });

  test('goes to the commit of what is picked, a bookmarked branch, a bookmarked commit or a stash, and offers a bookmark whose branch is gone disabled', () => {
    const bookmarks = named(menu, 'Bookmarks');
    assert.ok(bookmarks && !('separator' in bookmarks));
    assert.deepStrictEqual(labels(bookmarks.submenu), [
      'main',
      'abcdef1',
      'gone',
    ]);
    for (const item of bookmarks.submenu ?? []) {
      if (!('separator' in item) && item.disabled !== true) {
        item.onClick?.();
      }
    }
    const gone = named(bookmarks.submenu, 'gone');
    assert.ok(gone && !('separator' in gone) && gone.disabled === true);
    const stashes = named(menu, 'Stashes');
    assert.ok(stashes && !('separator' in stashes));
    const [stash] = stashes.submenu ?? [];
    assert.ok(stash && !('separator' in stash));
    stash.onClick?.();
    assert.deepStrictEqual(jumped, ['m', 'abcdef1234', 's']);
  });
});
