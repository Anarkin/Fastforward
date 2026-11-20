import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { newTabState, select } from '../../../../../tools/git/main/tabState';
import { loadHistory } from '../../../../../tools/git/main/tabHistory';
import {
  commitsMessage,
  firstPage,
} from '../../../../../tools/git/main/tabLayout';
import { keep, replayOf } from '../../../../../tools/git/main/tabReplay';
import { Commits } from '../../../../../tools/git/main/commits';
import { history, laidOut } from './tabStateFixtures';

suite('Tab replay', () => {
  test('replays the commits at the selected commit and the one that keeps its place', () => {
    const tab = laidOut();
    keep(tab.shown, commitsMessage(tab, firstPage(tab, false, 'h0'), []));
    select(tab, 'h5');
    tab.anchor = { hash: 'h9', offset: 2, report: 1 };
    const replayed = replayOf(tab).find(
      (message) => message.type === 'commits',
    );
    assert.strictEqual(replayed?.selectedIndex, 5);
    assert.deepStrictEqual(replayed.scrollTarget, {
      index: 9,
      offset: 2,
      report: 1,
    });
  });

  test('replays the commits with the lanes of the commits with more than one bubble the walk of the graph found after them, and none found for an earlier layout', () => {
    const tab = laidOut();
    const message = commitsMessage(tab, firstPage(tab, false, 'h0'), []);
    keep(tab.shown, message);
    const crowded = [{ position: 3, hash: 'h3', lanes: 2 }];
    keep(tab.shown, {
      type: 'crowdedLanes',
      generation: message.generation - 1,
      crowded: [{ position: 3, hash: 'h3', lanes: 5 }],
    });
    keep(tab.shown, {
      type: 'crowdedLanes',
      generation: message.generation,
      crowded,
    });
    assert.deepStrictEqual(
      replayOf(tab).find((shown) => shown.type === 'commits')?.crowded,
      crowded,
    );
  });

  test('replays the files before the diff or whole file that came last', () => {
    const tab = newTabState();
    select(tab, 'a');
    keep(tab.shown, { type: 'diff', hash: 'a', path: 'x', patch: '' });
    keep(tab.shown, { type: 'files', hash: 'a', files: [] });
    keep(tab.shown, {
      type: 'fileContent',
      hash: 'a',
      path: 'y',
      content: '',
      binary: false,
    });
    keep(tab.shown, { type: 'error', message: 'once' });
    assert.deepStrictEqual(
      replayOf(tab).map((message) => message.type),
      ['files', 'fileContent'],
    );
  });

  test('replays whether it is fetching, pulling and pushing, a tag too, so a tab shown again keeps saying so', () => {
    const tab = newTabState();
    keep(tab.shown, { type: 'pushingBranch', names: ['side'] });
    keep(tab.shown, { type: 'pullingBranch', names: ['side'] });
    keep(tab.shown, { type: 'pushingTag', names: ['v1'] });
    keep(tab.shown, { type: 'pushing', running: true });
    keep(tab.shown, { type: 'pulling', running: true });
    keep(tab.shown, { type: 'fetching', running: true });
    assert.deepStrictEqual(
      replayOf(tab).map((message) => message.type),
      [
        'fetching',
        'pulling',
        'pushing',
        'pushingTag',
        'pullingBranch',
        'pushingBranch',
      ],
    );
  });

  test('replays no files, diff or tree of a commit no longer selected', () => {
    const tab = newTabState();
    loadHistory(tab, Commits.of(history), undefined, []);
    select(tab, 'a');
    keep(tab.shown, { type: 'files', hash: 'a', files: [] });
    keep(tab.shown, { type: 'diff', hash: 'a', path: 'x', patch: '' });
    keep(tab.shown, { type: 'tree', hash: 'a', paths: [] });
    select(tab, 'b');
    assert.deepStrictEqual(
      replayOf(tab).map((message) => message.type),
      [],
    );
  });
});
