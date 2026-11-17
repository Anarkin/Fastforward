import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';

interface Ended {
  readonly code: number;
  readonly output: string;
}

interface Checks {
  readonly checks: readonly string[];
  readonly runChecks: (
    names: readonly string[],
    run: (name: string) => Promise<Ended>,
  ) => Promise<{ readonly code: number; readonly said: string }>;
}

async function loadChecks(): Promise<Checks> {
  const loaded: Checks = await import(
    pathToFileURL(
      path.join(__dirname, '..', '..', '..', 'scripts', 'checks.mts'),
    ).href
  );
  return loaded;
}

const later = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

suite('Checks run side by side', () => {
  test('runs the format check, the lint, knip and the type check, the checks a commit waits for besides its tests', async () => {
    const { checks } = await loadChecks();
    assert.deepStrictEqual(checks, [
      'format:check',
      'lint',
      'knip',
      'check-types',
    ]);
  });

  test('starts every check at once rather than one after another, and says they passed without what they printed', async () => {
    const { runChecks } = await loadChecks();
    let running = 0;
    let mostAtOnce = 0;
    const checked = await runChecks(['one', 'two', 'three'], async (name) => {
      running += 1;
      mostAtOnce = Math.max(mostAtOnce, running);
      await later(10);
      running -= 1;
      return { code: 0, output: `${name} is fine\n` };
    });
    assert.strictEqual(mostAtOnce, 3);
    assert.deepStrictEqual(checked, {
      code: 0,
      said: 'one, two and three passed',
    });
  });

  test('fails once any check failed, having let the others end, and shows what each failed one printed, in the order of the checks whichever ended first', async () => {
    const { runChecks } = await loadChecks();
    const ended: string[] = [];
    const checked = await runChecks(
      ['one', 'two', 'three', 'four'],
      async (name) => {
        await later(name === 'two' ? 20 : name === 'four' ? 5 : 1);
        ended.push(name);
        return name === 'two' || name === 'four'
          ? { code: name === 'two' ? 1 : 2, output: `${name} is broken\n\n` }
          : { code: 0, output: `${name} is fine\n` };
      },
    );
    assert.deepStrictEqual(ended.toSorted(), ['four', 'one', 'three', 'two']);
    assert.strictEqual(ended.at(-1), 'two');
    assert.deepStrictEqual(checked, {
      code: 1,
      said: [
        'two failed:',
        'two is broken',
        'four failed:',
        'four is broken',
        'one and three passed',
      ].join('\n'),
    });
  });

  test('takes a check that could not be started as failed, saying why', async () => {
    const { runChecks } = await loadChecks();
    assert.deepStrictEqual(
      await runChecks(['one'], () =>
        Promise.reject(new Error('spawn npm ENOENT')),
      ),
      { code: 1, said: 'one failed:\nError: spawn npm ENOENT' },
    );
  });
});
