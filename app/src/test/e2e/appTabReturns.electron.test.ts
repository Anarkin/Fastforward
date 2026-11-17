import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { tools } from '../../shell/shared/tools';
import {
  everyTab,
  searchEveryTab,
  searchTheViewer,
  sharedEveryToolApp,
  shownTabs,
  throughEveryOther,
} from './everyToolAppFixtures';

suite('App tabs shown again', () => {
  sharedEveryToolApp();

  test('opens a tab of every tool the app has, so a tool added later is held to coming back as left too', () => {
    assert.deepStrictEqual(
      tools.filter(
        (tool) => !shownTabs('', '').some(({ tab }) => tab.tool === tool),
      ),
      [],
    );
  });

  test(
    'brings back a file viewed with its find open, its query, the match it was on and the caret in its box, from every other tab, of the same tool or another',
    async () => {
      await searchTheViewer();
      await throughEveryOther(1, 'The viewer searching');
    },
    everyTab,
  );

  test(
    'brings back every search opened, typed in and toggled, with its caret, from every other tab',
    async () => {
      await searchEveryTab((index, kind) =>
        throughEveryOther(index, `The ${kind} tab searching`),
      );
    },
    everyTab,
  );
});
