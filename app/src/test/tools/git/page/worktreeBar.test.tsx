import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, suite, test, vi } from 'vitest';
import { type WorktreeInfo } from '../../../../tools/git/shared/protocol';
import {
  adjacentWorktree,
  WorktreeBar,
} from '../../../../tools/git/page/worktreeBar';
import { rested } from '../../../componentFixtures';
import { noop, renderedBy, tagsWith } from '../../../fixtures';

function rowsShown(worktrees: WorktreeInfo[] | undefined): number {
  return tagsWith(
    renderToStaticMarkup(
      <WorktreeBar
        worktrees={worktrees}
        active="/a"
        onSelect={noop}
        onPreload={noop}
      />,
    ),
    'worktrees',
  ).length;
}

suite('Worktree bar', () => {
  afterEach(() => vi.useRealTimers());

  type Worktree = {
    title: string;
    className: string;
    onPointerEnter: () => void;
    onClick?: () => void;
    children: React.ReactNode[];
  };

  function worktreesOf(
    selected: string[],
    preloaded: string[],
  ): React.ReactElement<Worktree>[] {
    const nav = renderedBy(WorktreeBar, {
      worktrees: [
        { root: '/a', name: 'main', folder: 'app', main: true, missing: false },
        {
          root: '/b',
          name: 'gone',
          folder: 'gone',
          main: false,
          missing: true,
        },
        {
          root: '/c',
          name: 'feature',
          folder: 'app-feature',
          main: false,
          missing: false,
        },
      ],
      active: '/a',
      onSelect: (root) => selected.push(root),
      onPreload: (root) => preloaded.push(root),
    });
    assert.ok(isValidElement<{ children: React.ReactElement }>(nav));
    const list = nav.props.children;
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(list));
    return list.props.children.map((worktree) => {
      assert.ok(isValidElement<Worktree>(worktree));
      return worktree;
    });
  }

  test('skips the worktrees whose folder is missing', () => {
    const worktrees = [
      { root: '/a', name: 'main', folder: 'a', main: true, missing: false },
      { root: '/b', name: 'gone', folder: 'b', main: false, missing: true },
      { root: '/c', name: 'feature', folder: 'c', main: false, missing: false },
    ];
    assert.strictEqual(adjacentWorktree(worktrees, '/a', 1), '/c');
    assert.strictEqual(adjacentWorktree(worktrees, '/a', -1), '/c');
    assert.strictEqual(adjacentWorktree(worktrees, '/b', 1), '/c');
    assert.strictEqual(
      adjacentWorktree(worktrees.slice(0, 2), '/a', 1),
      undefined,
    );
  });

  test('marks the worktree shown, naming each folder in its tooltip and the main one by its branch alone', () => {
    const [main, gone, feature] = worktreesOf([], []);
    assert.strictEqual(main.props.title, '/a');
    assert.match(main.props.className, /\bactive\b/);
    const [name, folder] = main.props.children;
    assert.ok(isValidElement<{ className: string }>(name));
    assert.strictEqual(name.props.className, 'tab-name');
    assert.strictEqual(folder, false);
    assert.doesNotMatch(feature.props.className, /\bactive\b/);
    assert.match(gone.props.className, /\bmissing\b/);
    assert.strictEqual(gone.props.title, "/b doesn't exist anymore");
  });

  test('shows the folder of a linked worktree dimmed after its branch, unless they are named the same', () => {
    const [main, gone, feature] = worktreesOf([], []);
    const shown = feature.props.children[1];
    assert.ok(isValidElement<{ className: string; children: string }>(shown));
    assert.strictEqual(shown.props.className, 'tab-folder');
    assert.strictEqual(shown.props.children, 'app-feature');
    assert.strictEqual(main.props.children[1], false);
    assert.strictEqual(gone.props.children[1], false);
  });

  test('shows no row while the worktrees are listed or the main clone is the only one, but does beside a worktree whose folder is gone', () => {
    const main = {
      root: '/a',
      name: 'main',
      folder: 'a',
      main: true,
      missing: false,
    };
    assert.strictEqual(rowsShown(undefined), 0);
    assert.strictEqual(rowsShown([main]), 0);
    assert.strictEqual(
      rowsShown([
        main,
        { root: '/b', name: 'b', folder: 'b', main: false, missing: true },
      ]),
      1,
    );
  });

  test('opens and preloads a worktree, but neither a missing one', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const selected: string[] = [];
    const preloaded: string[] = [];
    const [, gone, feature] = worktreesOf(selected, preloaded);
    gone.props.onPointerEnter();
    gone.props.onClick?.();
    rested();
    assert.deepStrictEqual([selected, preloaded], [[], []]);
    feature.props.onPointerEnter();
    rested();
    feature.props.onClick?.();
    assert.deepStrictEqual([selected, preloaded], [['/c'], ['/c']]);
  });
});

suite('Worktree bar for assistive technology', () => {
  test('tells that the worktrees form a tab list, which one is open, and which are gone', () => {
    const document = new JSDOM(
      renderToStaticMarkup(
        <WorktreeBar
          worktrees={[
            {
              root: '/a',
              name: 'main',
              folder: 'a',
              main: true,
              missing: false,
            },
            { root: '/b', name: 'b', folder: 'b', main: false, missing: true },
          ]}
          active="/a"
          onSelect={noop}
          onPreload={noop}
        />,
      ),
    ).window.document;
    assert.strictEqual(
      document.querySelector('[role="tablist"]')?.getAttribute('aria-label'),
      'Worktrees',
    );
    assert.deepStrictEqual(
      Array.from(document.querySelectorAll('[role="tab"]'), (tab) => [
        tab.getAttribute('aria-selected'),
        tab.getAttribute('aria-disabled'),
      ]),
      [
        ['true', null],
        ['false', 'true'],
      ],
    );
  });
});
