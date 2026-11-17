import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';

interface TestFile {
  readonly file: string;
  readonly project: string;
  readonly workers: number;
}

interface TestShards {
  readonly secondsToLoadAFile: number;
  readonly weightsOf: (
    files: readonly TestFile[],
    seconds: Readonly<Record<string, number>>,
  ) => Map<string, number>;
  readonly balancedShards: (
    weights: ReadonlyMap<string, number>,
    count: number,
  ) => string[][];
}

async function loadTestShards(): Promise<TestShards> {
  const loaded: TestShards = await import(
    pathToFileURL(
      path.join(__dirname, '..', '..', '..', 'scripts', 'testShards.mts'),
    ).href
  );
  return loaded;
}

const loadOf = (shard: readonly string[], weights: Map<string, number>) =>
  shard.reduce((sum, file) => sum + (weights.get(file) ?? 0), 0);

suite('Shards balanced by how long their files take', () => {
  test('weighs a file of a project run one file at a time by its seconds and the time to load it, and one of a project run side by side by its share of the workers', async () => {
    const { weightsOf, secondsToLoadAFile } = await loadTestShards();
    assert.deepStrictEqual(
      weightsOf(
        [
          { file: 'app.electron.test.ts', project: 'electron', workers: 1 },
          { file: 'unit.test.ts', project: 'unit', workers: 3 },
        ],
        { 'app.electron.test.ts': 90, 'unit.test.ts': 6 },
      ),
      new Map([
        ['app.electron.test.ts', 90 + secondsToLoadAFile],
        ['unit.test.ts', (6 + secondsToLoadAFile) / 3],
      ]),
    );
  });

  test('weighs a file never timed as the average of the files of its project, and as a second where none of them was timed', async () => {
    const { weightsOf, secondsToLoadAFile } = await loadTestShards();
    assert.deepStrictEqual(
      weightsOf(
        [
          { file: 'one.electron.test.ts', project: 'electron', workers: 1 },
          { file: 'two.electron.test.ts', project: 'electron', workers: 1 },
          { file: 'new.electron.test.ts', project: 'electron', workers: 1 },
          { file: 'new.git.test.ts', project: 'git', workers: 2 },
        ],
        { 'one.electron.test.ts': 10, 'two.electron.test.ts': 30 },
      ),
      new Map([
        ['one.electron.test.ts', 10 + secondsToLoadAFile],
        ['two.electron.test.ts', 30 + secondsToLoadAFile],
        ['new.electron.test.ts', 20 + secondsToLoadAFile],
        ['new.git.test.ts', (1 + secondsToLoadAFile) / 2],
      ]),
    );
  });

  test('spreads files timed at no time at all over every shard alike, as each still takes the time to load it', async () => {
    const { weightsOf, balancedShards } = await loadTestShards();
    const files = Array.from({ length: 40 }, (_, index) => ({
      file: `${index}.test.ts`,
      project: 'unit',
      workers: 3,
    }));
    const shards = balancedShards(
      weightsOf(files, Object.fromEntries(files.map(({ file }) => [file, 0]))),
      4,
    );
    assert.deepStrictEqual(
      shards.map((shard) => shard.length),
      [10, 10, 10, 10],
    );
  });

  test('puts every file in exactly one shard, as many shards as asked for, some of them empty when there are fewer files', async () => {
    const { balancedShards } = await loadTestShards();
    const weights = new Map(
      Array.from({ length: 7 }, (_, index) => [`${index}.test.ts`, index + 1]),
    );
    for (const count of [1, 2, 3, 7, 10]) {
      const shards = balancedShards(weights, count);
      assert.strictEqual(shards.length, count);
      assert.deepStrictEqual(shards.flat().toSorted(), [...weights.keys()]);
    }
  });

  test('leaves a file heavier than a fair share alone in its shard, and the other shards within the weight of one file of each other', async () => {
    const { balancedShards } = await loadTestShards();
    const weights = new Map([
      ['returns.electron.test.ts', 180],
      ['cursor.electron.test.ts', 100],
      ...Array.from(
        { length: 40 },
        (_, index) => [`${index}.electron.test.ts`, 5 + (index % 7)] as const,
      ),
    ]);
    const shards = balancedShards(weights, 4);
    assert.deepStrictEqual(
      shards.filter((shard) => shard.includes('returns.electron.test.ts')),
      [['returns.electron.test.ts']],
    );
    const loads = shards
      .filter((shard) => !shard.includes('returns.electron.test.ts'))
      .map((shard) => loadOf(shard, weights));
    assert.ok(Math.max(...loads) - Math.min(...loads) <= 11, loads.join(', '));
  });

  test('shards alike whatever order the files come in, so every shard of a run takes its part of one split', async () => {
    const { balancedShards } = await loadTestShards();
    const entries = Array.from(
      { length: 30 },
      (_, index) => [`${index}.test.ts`, index % 4] as const,
    );
    assert.deepStrictEqual(
      balancedShards(new Map(entries), 5),
      balancedShards(new Map(entries.toReversed()), 5),
    );
  });
});
