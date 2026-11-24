import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test, vi } from 'vitest';
import {
  stopTree,
  treeStopWait,
} from '../../../../../tools/git/main/processTree';

const taskkill = path.join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'taskkill.exe',
);

function runningChild() {
  return { pid: 4321, exitCode: null, signalCode: null, kill: () => true };
}

function recorded() {
  const events: string[] = [];
  let endTaskkill: ((error: Error | null) => void) | undefined;
  return {
    events,
    held: (pid: number) => {
      events.push(`held ${pid}`);
      return () => {
        events.push(`released ${pid}`);
      };
    },
    start: (
      file: string,
      args: readonly string[],
      _options: unknown,
      ended: (error: Error | null) => void,
    ) => {
      events.push(`started ${file} ${args.join(' ')}`);
      endTaskkill = ended;
    },
    endTaskkill: (error: Error | null = null) => endTaskkill?.(error),
  };
}

async function killedBy(stop: () => Promise<void>): Promise<unknown[][]> {
  const killed: unknown[][] = [];
  const kill = vi.spyOn(process, 'kill').mockImplementation((...args) => {
    killed.push(args);
    return true;
  });
  try {
    await stop();
  } finally {
    kill.mockRestore();
  }
  return killed;
}

suite('Stopping a process and what it started', () => {
  test('holds the process open on Windows before it starts taskkill and lets go of it only once taskkill has ended, as Windows gave the id of a process that ended by itself meanwhile to another, which taskkill stopped instead, the next git the app started', async () => {
    const { events, held, start, endTaskkill } = recorded();

    const stopped = stopTree(runningChild(), 'win32', held, start);
    await new Promise((resolve) => setImmediate(resolve));
    const whileTaskkillRuns = [...events];
    endTaskkill();
    await stopped;

    assert.deepStrictEqual(whileTaskkillRuns, [
      'held 4321',
      `started ${taskkill} /pid 4321 /t /f`,
    ]);
    assert.deepStrictEqual(events, [...whileTaskkillRuns, 'released 4321']);
  });

  test('waits for taskkill only so long, letting go of the process then and having taskkill ended, as a taskkill started on a git ending by itself as it was stopped called back only 30 seconds later, and the git, the request that stopped it and the load of a tab waiting on that request all waited with it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { events, held, start } = recorded();
      let options: unknown;

      const stopped = stopTree(
        runningChild(),
        'win32',
        held,
        (file, args, given, ended) => {
          options = given;
          start(file, args, given, ended);
        },
      );
      await vi.advanceTimersByTimeAsync(treeStopWait - 1);
      const before = [...events];
      await vi.advanceTimersByTimeAsync(1);
      await stopped;

      assert.deepStrictEqual(before, [
        'held 4321',
        `started ${taskkill} /pid 4321 /t /f`,
      ]);
      assert.deepStrictEqual(events, [...before, 'released 4321']);
      assert.deepStrictEqual(options, {
        windowsHide: true,
        timeout: treeStopWait,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test('holds the process as soon as it is asked to stop it, before anything else runs, as only until the process is seen to have ended does its id surely name it', () => {
    const { events, held, start } = recorded();

    void stopTree(runningChild(), 'win32', held, start);

    assert.strictEqual(events[0], 'held 4321');
  });

  test('lets go of the process when taskkill fails too, and when it cannot be started', async () => {
    const failed = recorded();
    const stopped = stopTree(
      runningChild(),
      'win32',
      failed.held,
      failed.start,
    );
    failed.endTaskkill(new Error('taskkill exited with code 128'));
    await stopped;
    const unstarted = recorded();

    await assert.rejects(
      stopTree(runningChild(), 'win32', unstarted.held, () => {
        throw new Error('no taskkill');
      }),
      /no taskkill/,
    );

    assert.strictEqual(failed.events.at(-1), 'released 4321');
    assert.deepStrictEqual(unstarted.events, ['held 4321', 'released 4321']);
  });

  test('starts no taskkill for a process it cannot hold, as its id may name another process by then', async () => {
    const { events, start } = recorded();

    await stopTree(runningChild(), 'win32', () => undefined, start);

    assert.deepStrictEqual(events, []);
  });

  test('neither holds nor stops a process that has ended, was ended by a signal or never started', async () => {
    const { events, held, start } = recorded();

    const killed = await killedBy(async () => {
      for (const platform of ['win32', 'linux'] as const) {
        await stopTree(
          { ...runningChild(), exitCode: 0 },
          platform,
          held,
          start,
        );
        await stopTree(
          { ...runningChild(), signalCode: 'SIGTERM' },
          platform,
          held,
          start,
        );
        await stopTree(
          { ...runningChild(), pid: undefined },
          platform,
          held,
          start,
        );
      }
    });

    assert.deepStrictEqual(events, []);
    assert.deepStrictEqual(killed, []);
  });

  test('ends the process group outside Windows as before, holding nothing and starting no taskkill, and the process alone when it leads no group', async () => {
    const { events, held, start } = recorded();
    const alone: string[] = [];

    const killed = await killedBy(() =>
      stopTree(runningChild(), 'linux', held, start),
    );
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('no such process group');
    });
    try {
      await stopTree(
        {
          ...runningChild(),
          kill: () => {
            alone.push('killed');
            return true;
          },
        },
        'darwin',
        held,
        start,
      );
    } finally {
      kill.mockRestore();
    }

    assert.deepStrictEqual(killed, [[-4321, 'SIGTERM']]);
    assert.deepStrictEqual(alone, ['killed']);
    assert.deepStrictEqual(events, []);
  });
});
