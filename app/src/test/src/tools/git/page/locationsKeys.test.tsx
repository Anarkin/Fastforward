import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { suite, test } from 'vitest';
import type {
  Bookmark,
  RepositoryState,
} from '../../../../../tools/git/shared/protocol';
import { LocationsPopup } from '../../../../../tools/git/page/locations';
import { commitInfo, noop, stylesheet } from '../../../../helpers/fixtures';
import { renderIn } from '../../../../helpers/componentFixtures';
import { GitStore } from '../../../../../tools/git/page/store';
import { type Shown, locationsStore, repository } from './locationsFixtures';

async function browsed(
  props: Shown,
  check: (page: {
    readonly document: Document;
    readonly field: HTMLInputElement;
    readonly press: (key: string) => Promise<void>;
    readonly active: () => Element | null;
  }) => void | Promise<void>,
): Promise<void> {
  const dom = new JSDOM('<!doctype html><main></main>');
  dom.window.HTMLElement.prototype.scrollIntoView = noop;
  const globals = {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = Object.fromEntries(
    Object.keys(globals).map((name) => [name, Reflect.get(globalThis, name)]),
  );
  Object.assign(globalThis, globals);
  try {
    const { createRoot } = await import('react-dom/client');
    const { document } = dom.window;
    const main = document.querySelector('main');
    assert.ok(main);
    const root = createRoot(main);
    await act(async () => {
      renderIn(
        root,
        <GitStore value={locationsStore(props)}>
          <LocationsPopup anchor={{ current: null }} />
        </GitStore>,
      );
    });
    const field = document.querySelector<HTMLInputElement>('input');
    assert.ok(field);
    await check({
      document,
      field,
      press: (key) =>
        act(async () => {
          field.dispatchEvent(
            new dom.window.KeyboardEvent('keydown', {
              key,
              bubbles: true,
              cancelable: true,
            }),
          );
        }),
      active: () => {
        const id = field.getAttribute('aria-activedescendant');
        return id === null ? null : document.getElementById(id);
      },
    });
    await act(async () => {
      root.unmount();
    });
  } finally {
    Object.assign(globalThis, saved);
  }
}

const browsedState: RepositoryState = {
  ...repository(['branch', 'main'], ['branch', 'feat/a'], ['remote', 'o/x']),
  head: 'main',
  stashes: [{ name: 'stash@{0}', commit: 'f'.repeat(40), message: 'wip' }],
};

const bookmarked: Bookmark[] = [{ kind: 'commit', name: 'e'.repeat(40) }];

suite('Clicking in the locations', () => {
  test('keeps the keyboard in the field when a row, a heading or the list is pressed, as typing then ran the shortcuts of the tab, but leaves pressing the field to it', async () => {
    await browsed({ repository: browsedState }, ({ document, field }) => {
      const view = document.defaultView;
      assert.ok(view !== null);
      const pressed = (target: Element | null) => {
        assert.ok(target !== null);
        const event = new view.MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
        });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      };

      assert.deepStrictEqual(
        [
          pressed(document.querySelector('.locations-heading')),
          pressed(document.querySelector('.locations-groups')),
          pressed(field),
        ],
        [true, true, false],
      );
    });
  });
});

suite('Browsing the locations by keyboard', () => {
  test('tells assistive technology the field picks from the rows below it, and which of them is picked', async () => {
    await browsed({ repository: browsedState }, async ({ field, press }) => {
      assert.strictEqual(field.getAttribute('role'), 'combobox');
      assert.strictEqual(field.getAttribute('aria-expanded'), 'true');
      const results = field.ownerDocument.getElementById(
        field.getAttribute('aria-controls') ?? '',
      );
      assert.strictEqual(results?.getAttribute('role'), 'tree');
      assert.strictEqual(field.getAttribute('aria-activedescendant'), null);
      await press('ArrowDown');
      assert.ok(
        results.contains(
          field.ownerDocument.getElementById(
            field.getAttribute('aria-activedescendant') ?? '',
          ),
        ),
      );
    });
  });

  test('moves through the pinned rows, the trees and the stashes with the arrows for no search, and jumps to the picked one on Enter', async () => {
    const jumped: string[] = [];
    let closed = 0;
    await browsed(
      {
        repository: browsedState,
        bookmarks: bookmarked,
        onJump: (commit) => jumped.push(commit),
        onClose: () => closed++,
      },
      async ({ press, active }) => {
        const seen: (string | null | undefined)[] = [];
        for (let step = 0; step < 6; step++) {
          await press('ArrowDown');
          const row = active();
          assert.strictEqual(row?.getAttribute('aria-selected'), 'true');
          seen.push(row?.textContent);
        }
        assert.deepStrictEqual(seen, [
          'e'.repeat(7),
          '▸feat',
          'main',
          '▾o',
          'x',
          'stash@{0}wip',
        ]);
        for (let step = 0; step < 5; step++) {
          await press('ArrowUp');
        }
        await press('Enter');
        assert.deepStrictEqual(jumped, ['e'.repeat(40)]);
        assert.strictEqual(closed, 1);
      },
    );
  });

  test('opens and closes a folder on Enter, telling assistive technology its level and whether it is open', async () => {
    const jumped: string[] = [];
    await browsed(
      { repository: browsedState, onJump: (commit) => jumped.push(commit) },
      async ({ press, active }) => {
        await press('ArrowDown');
        const folder = active();
        assert.strictEqual(folder?.getAttribute('role'), 'treeitem');
        assert.strictEqual(folder.getAttribute('aria-level'), '1');
        assert.strictEqual(folder.getAttribute('aria-expanded'), 'false');
        await press('Enter');
        assert.strictEqual(active()?.getAttribute('aria-expanded'), 'true');
        await press('ArrowDown');
        const leaf = active();
        assert.strictEqual(leaf?.textContent, 'a');
        assert.strictEqual(leaf.getAttribute('aria-level'), '2');
        assert.strictEqual(leaf.getAttribute('aria-expanded'), null);
        await press('Enter');
        assert.deepStrictEqual(jumped, ['c'.repeat(40)]);
      },
    );
  });

  test('marks the row the arrows reach in a tree as a picked result is marked', () => {
    assert.match(
      stylesheet(),
      /^\.locations-list \.row\.result\.active,\n\.locations-list \.row\.tree-row\.active \{[^}]*background: var\(--selection-background\)/m,
    );
  });

  test('moves through the pinned rows, the refs, the stashes and the commits with the arrows for a search, and jumps to the picked one on Enter', async () => {
    const jumped: string[] = [];
    const [main, maint, merge] = ['a', 'b', 'd'].map((c) => c.repeat(40));
    await browsed(
      {
        repository: {
          head: 'main',
          headCommit: main,
          refs: [
            { kind: 'branch', name: 'main', commit: main },
            { kind: 'branch', name: 'maint', commit: maint },
            { kind: 'remote', name: 'o/main', commit: main },
            { kind: 'tag', name: 'main-1', commit: main },
          ],
          stashes: [
            { name: 'stash@{0}', commit: 'f'.repeat(40), message: 'On main' },
          ],
        },
        bookmarks: [{ kind: 'branch', name: 'maint' }],
        query: 'main',
        commitSearch: {
          type: 'commitSearch',
          query: 'main',
          result: {
            commits: [commitInfo(merge, { subject: "Merge branch 'main'" })],
            capped: false,
          },
        },
        onJump: (commit) => jumped.push(commit),
      },
      async ({ field, press, active }) => {
        const base = (field.getAttribute('aria-controls') ?? '').replace(
          /results$/,
          '',
        );
        const seen: (string | undefined)[] = [];
        for (let step = 0; step < 7; step++) {
          const row = active();
          assert.strictEqual(row?.getAttribute('role'), 'option');
          assert.strictEqual(row.getAttribute('aria-selected'), 'true');
          seen.push(row.id.slice(base.length));
          await press('ArrowDown');
        }
        assert.deepStrictEqual(seen, [
          'pinned:branch:maint',
          'branch:main',
          'branch:maint',
          'remote:o/main',
          'tag:main-1',
          'stash:stash@{0}',
          `commit:${merge}`,
        ]);
        for (let step = 0; step < 6; step++) {
          await press('ArrowUp');
        }
        await press('Enter');
        assert.deepStrictEqual(jumped, [maint]);
      },
    );
  });

  test('lists the results of a search as options of a list box', async () => {
    await browsed(
      { repository: browsedState, query: 'ma' },
      ({ field, active }) => {
        const results = field.ownerDocument.getElementById(
          field.getAttribute('aria-controls') ?? '',
        );
        assert.strictEqual(results?.getAttribute('role'), 'listbox');
        const row = active();
        assert.strictEqual(row?.getAttribute('role'), 'option');
        assert.strictEqual(row.getAttribute('aria-selected'), 'true');
        assert.strictEqual(row.textContent, 'main');
      },
    );
  });
});
