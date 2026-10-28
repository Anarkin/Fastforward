import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  pushDestination,
  type PushSettings,
} from '../../../../../tools/git/main/cli/branches';

suite('Git branches', () => {
  test('pushes a branch where git push would for each push.default, and nowhere where git push would refuse', () => {
    const simple: PushSettings = {
      pushDefault: 'simple',
      fetchRemote: 'origin',
      pushRemote: 'origin',
      merges: ['refs/heads/main'],
    };
    const otherName = { ...simple, merges: ['refs/heads/other'] };
    const toFork = { ...simple, pushRemote: 'fork' };
    const cases: [PushSettings, ReturnType<typeof pushDestination>][] = [
      [simple, { remote: 'origin', remoteRef: 'refs/heads/main' }],
      [
        { ...simple, pushDefault: 'unknown' },
        { remote: 'origin', remoteRef: 'refs/heads/main' },
      ],
      [otherName, 'otherName'],
      [
        { ...otherName, pushDefault: 'upstream' },
        { remote: 'origin', remoteRef: 'refs/heads/other' },
      ],
      [
        { ...otherName, pushDefault: 'tracking' },
        { remote: 'origin', remoteRef: 'refs/heads/other' },
      ],
      [
        { ...otherName, pushDefault: 'current' },
        { remote: 'origin', remoteRef: 'refs/heads/main' },
      ],
      [
        { ...otherName, pushDefault: 'matching' },
        { remote: 'origin', remoteRef: 'refs/heads/main' },
      ],
      [{ ...otherName, pushDefault: 'nothing' }, 'setting'],
      [toFork, { remote: 'fork', remoteRef: 'refs/heads/main' }],
      [
        { ...toFork, merges: ['refs/heads/other'] },
        { remote: 'fork', remoteRef: 'refs/heads/main' },
      ],
      [{ ...toFork, pushDefault: 'upstream' }, 'setting'],
      [
        { ...simple, merges: ['refs/heads/main', 'refs/heads/other'] },
        'setting',
      ],
      [
        {
          ...simple,
          pushDefault: 'upstream',
          merges: ['refs/heads/main', 'refs/heads/other'],
        },
        'setting',
      ],
      [{ ...simple, merges: [] }, 'setting'],
    ];
    for (const [settings, destination] of cases) {
      assert.deepStrictEqual(
        pushDestination('main', settings),
        destination,
        JSON.stringify(settings),
      );
    }
  });
});
