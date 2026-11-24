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
  readonly projectsRunAFileAtATime: readonly string[];
  readonly shuffledBy: <T>(items: readonly T[], seed: number) => T[];
  readonly ShardsByDuration: new (context: {
    readonly config: {
      readonly root: string;
      readonly shard: { readonly index: number; readonly count: number };
    };
  }) => {
    shard(specifications: readonly Specification[]): Promise<Specification[]>;
  };
}

interface Specification {
  readonly moduleId: string;
  readonly project: {
    readonly name: string;
    readonly config: { readonly maxWorkers: number };
  };
}

async function loadTestShards(): Promise<TestShards> {
  const loaded: TestShards = await import(
    pathToFileURL(
      path.join(__dirname, '..', '..', '..', 'scripts', 'testShards.mts'),
    ).href
  );
  return loaded;
}

interface TestsConfigured {
  readonly default: {
    readonly test: {
      readonly projects: readonly {
        readonly test: {
          readonly name: string;
          readonly fileParallelism?: boolean;
        };
      }[];
    };
  };
}

async function loadTestsConfigured(): Promise<TestsConfigured> {
  const loaded: TestsConfigured = await import(
    pathToFileURL(path.join(__dirname, '..', '..', '..', 'vitest.config.mts'))
      .href
  );
  return loaded;
}

const loadOf = (shard: readonly string[], weights: Map<string, number>) =>
  shard.reduce((sum, file) => sum + (weights.get(file) ?? 0), 0);

suite('Shards balanced by how long their files take', () => {
  test('shuffles the files of a run by its seed, the same seed giving the same order, so a test that passes only after some files fails soon and its order can be run again', async () => {
    const { shuffledBy } = await loadTestShards();
    const files = Array.from({ length: 20 }, (_, index) => `file${index}`);
    const shuffled = shuffledBy(files, 42);
    assert.deepStrictEqual(shuffledBy(files, 42), shuffled);
    assert.deepStrictEqual(shuffled.toSorted(), files.toSorted());
    assert.notDeepStrictEqual(shuffled, files);
    assert.notDeepStrictEqual(shuffledBy(files, 43), shuffled);
  });

  test('takes for run a file at a time the very projects the tests are set up to run so, told by their names, which every machine reads alike, where the workers a machine has for a project follow its processors', async () => {
    const { projectsRunAFileAtATime } = await loadTestShards();
    const configured = await loadTestsConfigured();
    assert.deepStrictEqual(
      configured.default.test.projects
        .filter((project) => project.test.fileParallelism === false)
        .map((project) => project.test.name),
      projectsRunAFileAtATime,
    );
  });

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

  test('splits the files alike on machines that have other workers for a project, weighing by workers every machine counts alike, one where a project runs a file at a time and three where it runs them side by side, as one macOS machine of a run of CI had other processors than the three beside it and split the files another way, so 204 test files ran on no machine, 204 on two, and the run passed', async () => {
    const { ShardsByDuration } = await loadTestShards();
    const root = path.join(__dirname, '..', '..', '..');
    const specifications = (workers: number) =>
      Array.from({ length: 60 }, (_, index) => {
        const alone = index % 4 === 0;
        return {
          moduleId: path.join(
            root,
            'src',
            'test',
            alone ? `app${index}.electron.test.ts` : `unit${index}.test.ts`,
          ),
          project: {
            name: alone ? 'electron' : 'unit',
            config: { maxWorkers: alone ? 1 : workers },
          },
        };
      });
    const shardOf = async (workers: number, index: number) =>
      (
        await new ShardsByDuration({
          config: { root, shard: { index, count: 4 } },
        }).shard(specifications(workers))
      ).map(({ moduleId }) => moduleId);
    const split: string[] = [];
    for (const index of [1, 2, 3, 4]) {
      const onTwoWorkers = await shardOf(2, index);
      assert.deepStrictEqual(await shardOf(7, index), onTwoWorkers);
      assert.deepStrictEqual(await shardOf(1, index), onTwoWorkers);
      split.push(...onTwoWorkers);
    }
    assert.deepStrictEqual(
      split.toSorted(),
      specifications(2)
        .map(({ moduleId }) => moduleId)
        .toSorted(),
    );
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
