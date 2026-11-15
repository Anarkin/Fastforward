import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import { newTabState } from '../../../../../tools/git/main/tabState';
import { loadHistory } from '../../../../../tools/git/main/tabHistory';
import {
  keepSubjects,
  navigationEntry,
  nearestSteps,
} from '../../../../../tools/git/main/tabSteps';
import { Commits } from '../../../../../tools/git/main/commits';
import { commitInfo } from '../../../../helpers/fixtures';
import { history, laidOut, page } from './tabStateFixtures';

suite('Tab steps', () => {
  test('names navigation entries after their subjects', () => {
    const tab = newTabState();
    keepSubjects(tab, [commitInfo('b', { subject: 'bee' })]);
    assert.strictEqual(navigationEntry(tab, 'b').subject, 'bee');
    assert.strictEqual(
      navigationEntry(tab, workingTreeHash).subject,
      'Uncommitted changes',
    );
  });

  test('forgets the subjects no step back or forward needs once a thousand are kept', () => {
    const tab = newTabState();
    keepSubjects(tab, page(0, 1000));
    tab.navigation = { back: ['c1'], forward: ['c2'] };
    tab.hash = 'c3';
    keepSubjects(tab, page(1000, 1));
    assert.deepStrictEqual(
      ['c0', 'c1', 'c2', 'c3', 'c1000'].map(
        (hash) => navigationEntry(tab, hash).subject,
      ),
      [undefined, 'c1', 'c2', 'c3', 'c1000'],
    );
  });

  test('lists no step to the commit shown in the dropdowns', () => {
    const tab = newTabState();
    loadHistory(tab, Commits.of(history), undefined, []);
    tab.hash = 'a';
    tab.navigation = { back: ['b', 'a'], forward: [] };
    assert.deepStrictEqual(nearestSteps(tab), { back: ['b'], forward: [] });
  });

  test('lists the 20 nearest steps back and forward in the dropdowns, nearest first', () => {
    const tab = laidOut();
    tab.hash = 'h24';
    tab.navigation = {
      back: Array.from({ length: 24 }, (_, i) => `h${i}`),
      forward: Array.from({ length: 24 }, (_, i) => `h${i + 30}`),
    };
    assert.deepStrictEqual(
      nearestSteps(tab).back,
      Array.from({ length: 20 }, (_, i) => `h${23 - i}`),
    );
    assert.deepStrictEqual(
      nearestSteps(tab).forward,
      Array.from({ length: 20 }, (_, i) => `h${53 - i}`),
    );
  });
});
