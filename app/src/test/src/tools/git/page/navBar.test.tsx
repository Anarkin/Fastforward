import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import {
  HistoryButton,
  NavButtons,
} from '../../../../../tools/git/page/navBar';
import { GitStore } from '../../../../../tools/git/page/store';
import type {
  GitToHost,
  NavigationEntry,
} from '../../../../../tools/git/shared/protocol';
import {
  gitStore,
  renderedInGit,
  type ShownGit,
} from '../../../../helpers/componentFixtures';
import { noop } from '../../../../helpers/fixtures';
import { classesOf, tagWith } from '../../../../helpers/markup';

const at = 'a'.repeat(40);

const navStore = (
  shown: ShownGit & {
    readonly back?: readonly NavigationEntry[];
    readonly forward?: readonly NavigationEntry[];
    readonly fetching?: boolean;
  } = {},
  post: (message: GitToHost) => void = noop,
) => {
  const { back = [], forward = [], fetching = false, ...rest } = shown;
  return gitStore(
    {
      headCommit: 'headCommit' in shown ? shown.headCommit : at,
      autoFetchMinutes: 1,
      ...rest,
      tab: { root: '/repo', back, forward, fetching },
    },
    post,
  );
};

const buttons = (shown: Parameters<typeof navStore>[0]) =>
  renderToStaticMarkup(
    <GitStore value={navStore(shown)}>
      <NavButtons />
    </GitStore>,
  );

const minute = 60_000;

const hour = 60 * minute;

const day = 24 * hour;

suite('Navigation bar', () => {
  test('greys out back and forward without steps', () => {
    const html = buttons({
      back: [{ hash: 'a'.repeat(40), subject: 'a' }],
    });
    assert.match(html, /data-tip="Back[^"]*"(?![^>]*disabled)/);
    assert.match(html, /data-tip="Forward[^"]*" disabled=""/);
  });

  test('spins the fetch button while fetching', () => {
    const spinning = tagWith(
      buttons({ fetching: true }),
      'data-tip="Fetch every remote',
      'nav-button',
      'running',
    );
    assert.match(spinning, /disabled=""/);
    const idle = tagWith(
      buttons({}),
      'data-tip="Fetch every remote',
      'nav-button',
    );
    assert.ok(!classesOf(idle).has('running'));
  });

  test('says when it last fetched in the fetch button tooltip, marking nothing while that is fresh', () => {
    const html = buttons({
      lastFetch: { succeeded: Date.now() - 3 * minute },
      autoFetch: true,
      autoFetchMinutes: 5,
    });
    tagWith(
      html,
      'data-tip="Fetch every remote, dropping branches deleted there\nFetched 3 minutes ago"',
      'nav-button',
    );
    assert.doesNotMatch(html, /fetch-mark/);
    assert.doesNotMatch(buttons({}), /fetch-mark|Fetched/);
  });

  test('marks the fetch button once fetching every few minutes missed a round', () => {
    const html = buttons({
      lastFetch: { succeeded: Date.now() - 3 * day },
      autoFetch: true,
      autoFetchMinutes: 5,
    });
    tagWith(html, '', 'fetch-mark', 'stale');
    tagWith(html, 'Fetched 3 days ago"', 'nav-button');
  });

  test('marks the fetch button when the last fetch failed, saying when it last fetched', () => {
    const html = buttons({
      lastFetch: {
        succeeded: Date.now() - 2 * hour,
        failed: Date.now() - minute,
      },
    });
    tagWith(html, '', 'fetch-mark', 'failed');
    tagWith(
      html,
      'Couldn&#x27;t fetch 1 minute ago\nLast fetched 2 hours ago"',
      'nav-button',
    );
    tagWith(
      buttons({ lastFetch: { failed: Date.now() } }),
      'Couldn&#x27;t fetch just now"',
      'nav-button',
    );
  });

  test('leaves the mark off while fetching, as the spinning button says more', () => {
    assert.doesNotMatch(
      buttons({ fetching: true, lastFetch: { failed: Date.now() } }),
      /fetch-mark/,
    );
  });

  test('pins fetching every few minutes next to the fetch button, disabled rather than left out when the settings give it no minutes', () => {
    tagWith(buttons({}), 'data-tip="Fetch Every Minute"');
    const on = tagWith(
      buttons({ autoFetch: true, autoFetchMinutes: 5 }),
      'data-tip="Fetch Every 5 Minutes"',
      'nav-button',
      'toggle',
      'active',
    );
    assert.match(on, /aria-pressed="true"/);
    assert.match(
      tagWith(
        buttons({ autoFetch: false, autoFetchMinutes: 0 }),
        'data-tip="Fetch Every Few Minutes"',
        'nav-button',
        'toggle',
      ),
      /disabled=""/,
    );
  });

  test('fetches on its button, and pins fetching every few minutes on the pin, unpinning it again', () => {
    for (const autoFetch of [false, true]) {
      const posted: GitToHost[] = [];
      const bar = renderedInGit(
        navStore({ autoFetch }, (message) => posted.push(message)),
        NavButtons,
        {},
      );
      assert.ok(isValidElement<{ children: React.ReactElement[] }>(bar));
      const pair = bar.props.children[3];
      assert.ok(isValidElement<{ children: React.ReactElement[] }>(pair));
      for (const button of pair.props.children) {
        assert.ok(isValidElement<{ onClick: () => void }>(button));
        button.props.onClick();
      }
      assert.deepStrictEqual(posted, [
        { type: 'fetch', root: '/repo' },
        { type: 'setAutoFetch', on: !autoFetch },
      ]);
    }
  });

  test('holds the pin together with the fetch button at the end, the pin alone switched on while pinned', () => {
    for (const autoFetch of [false, true]) {
      assert.match(
        buttons({ autoFetch }),
        new RegExp(
          `<div class="toolbar pin-pair"><button class="nav-button "[^>]*data-tip="Fetch[^"]*"[^>]*>.*?</button><button class="nav-button toggle ${autoFetch ? 'active' : ''}"[^>]*data-tip="Fetch Every Minute"[^>]*>.*?</button></div></div>$`,
        ),
      );
    }
  });

  test('selects the checked-out commit on a home button after forward, as H does, disabled while there is none', () => {
    const posted: GitToHost[] = [];
    const bar = renderedInGit(
      navStore({}, (message) => posted.push(message)),
      NavButtons,
      {},
    );
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(bar));
    const home = bar.props.children[2];
    assert.ok(isValidElement<{ onClick: () => void }>(home));
    home.props.onClick();
    assert.deepStrictEqual(posted, [{ type: 'jump', hash: at, root: '/repo' }]);
    assert.match(
      buttons({}),
      /data-tip="Forward[^"]*"[^>]*>.*?<\/button><button class="nav-button" aria-label="Select the checked-out commit" data-tip="Select the checked-out commit">/,
    );
    assert.match(
      buttons({ headCommit: undefined }),
      /data-tip="Select the checked-out commit" disabled=""/,
    );
  });
});

suite('History buttons', () => {
  test('go a step back or forward on a click, with no list of where they went, held or right-clicked, as the commander steps, Alt and the arrows or the mouse buttons doing the same', () => {
    const posted: GitToHost[] = [];
    const entry = { hash: at, subject: 'a' };
    const store = navStore(
      { back: [entry, entry], forward: [entry] },
      (message) => posted.push(message),
    );
    const steps = (['back', 'forward'] as const).map((direction) =>
      renderedInGit(store, HistoryButton, { direction }),
    );
    for (const button of steps) {
      assert.ok(
        isValidElement<{
          onClick: () => void;
          onContextMenu?: unknown;
          onPointerDown?: unknown;
        }>(button),
      );
      assert.strictEqual(button.type, 'button');
      assert.strictEqual(button.props.onContextMenu, undefined);
      assert.strictEqual(button.props.onPointerDown, undefined);
      button.props.onClick();
    }
    assert.deepStrictEqual(posted, [
      { type: 'navigate', direction: 'back', steps: 1, root: '/repo' },
      { type: 'navigate', direction: 'forward', steps: 1, root: '/repo' },
    ]);
    assert.doesNotMatch(
      buttons({ back: [entry] }),
      /history-button|history-menu/,
    );
  });
});
