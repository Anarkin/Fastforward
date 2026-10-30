import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  rankedFolders,
  visitsIn,
  withVisit,
  type FolderVisits,
} from '../../../../tools/terminal/main/folderRanks';

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;
const now = 100 * day;

function visits(folder: string, count: number, ago: number): FolderVisits {
  return { folder, visits: count, last: now - ago };
}

suite('Terminal folder ranks', () => {
  test('ranks folders by their visits times a weight for how long ago the last was, four times within the hour, twice within the day, half within the week and a quarter after', () => {
    assert.deepStrictEqual(
      rankedFolders(
        [
          visits('/temp', 1, minute),
          visits('/playground', 6, 20 * minute),
          visits('/vscode', 15, 5 * hour),
          visits('/pipeline', 120, 3 * day),
          visits('/linux', 300, 60 * day),
          visits('/fastforward', 40, 10 * minute),
        ],
        now,
      ),
      [
        '/fastforward',
        '/linux',
        '/pipeline',
        '/vscode',
        '/playground',
        '/temp',
      ],
    );
  });

  test('counts a visit to a folder known already on it, keeping the spelling of the latest, and starts a folder not known at one', () => {
    const visited = withVisit(
      [visits('/Code/app', 3, day), visits('/other', 1, day)],
      '/Code/app',
      now,
    );
    assert.deepStrictEqual(visited, [
      { folder: '/Code/app', visits: 4, last: now },
      visits('/other', 1, day),
    ]);
    assert.deepStrictEqual(withVisit([], '/new', now), [
      { folder: '/new', visits: 1, last: now },
    ]);
  });

  test('ages every folder by a tenth once the visits pass a thousand, forgetting those that fall below one', () => {
    const aged = withVisit(
      [visits('/busy', 999, hour), visits('/rare', 1, 30 * day)],
      '/busy',
      now,
    );
    assert.deepStrictEqual(aged, [{ folder: '/busy', visits: 900, last: now }]);
  });

  test('reads only the visits it saved from the state, leaving out anything else', () => {
    assert.deepStrictEqual(
      visitsIn([
        { folder: '/a', visits: 2, last: 5 },
        { folder: 3, visits: 2, last: 5 },
        { folder: '/b', visits: 'many', last: 5 },
        { folder: '/c', visits: 1, last: Number.NaN },
        'not a visit',
      ]),
      [{ folder: '/a', visits: 2, last: 5 }],
    );
    assert.deepStrictEqual(visitsIn(undefined), []);
  });
});
