import * as fs from 'node:fs';
import * as path from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { durationsFile, type Durations } from './testDurations.mts';

export interface TestFile {
  readonly file: string;
  readonly project: string;
  readonly workers: number;
}

const secondsOfAFileNeverTimed = 1;

export const secondsToLoadAFile = 0.3;

const workersSideBySide = 3;

export const projectsRunAFileAtATime: readonly string[] = ['electron', 'perf'];

const workersToWeighBy = (project: string): number =>
  projectsRunAFileAtATime.includes(project) ? 1 : workersSideBySide;

export function weightsOf(
  files: readonly TestFile[],
  seconds: Readonly<Record<string, number>>,
): Map<string, number> {
  const timedByProject = new Map<string, number[]>();
  for (const { file, project } of files) {
    const timed = seconds[file];
    if (timed !== undefined) {
      timedByProject.set(project, [
        ...(timedByProject.get(project) ?? []),
        timed,
      ]);
    }
  }
  const averageOf = (project: string) => {
    const timed = timedByProject.get(project) ?? [];
    return timed.length === 0
      ? secondsOfAFileNeverTimed
      : timed.reduce((sum, each) => sum + each, 0) / timed.length;
  };
  return new Map(
    files.map(({ file, project, workers }) => [
      file,
      ((seconds[file] ?? averageOf(project)) + secondsToLoadAFile) /
        Math.max(1, workers),
    ]),
  );
}

export function balancedShards(
  weights: ReadonlyMap<string, number>,
  count: number,
): string[][] {
  const shards = Array.from({ length: count }, () => ({
    files: [] as string[],
    load: 0,
  }));
  const heaviestFirst = [...weights].toSorted(
    ([one, oneWeight], [other, otherWeight]) =>
      otherWeight - oneWeight || (one < other ? -1 : one > other ? 1 : 0),
  );
  for (const [file, weight] of heaviestFirst) {
    const lightest = shards.reduce((least, shard) =>
      shard.load < least.load ? shard : least,
    );
    lightest.files.push(file);
    lightest.load += weight;
  }
  return shards.map(({ files }) => files);
}

export function readDurations(file = durationsFile): Durations {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

function seeded(seed: number, key: string): number {
  let state = (seed ^ 0x81_1c_9d_c5) >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    state = Math.imul(state ^ key.charCodeAt(index), 0x01_00_01_93) >>> 0;
  }
  state = (state + 0x6d_2b_79_f5) >>> 0;
  let mixed = Math.imul(state ^ (state >>> 15), state | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return (mixed ^ (mixed >>> 14)) >>> 0;
}

export function shuffledBy<T>(
  items: readonly T[],
  seed: number,
  keyOf: (item: T) => string = String,
): T[] {
  return items
    .map((item) => ({ item, key: keyOf(item) }))
    .map((each) => ({ ...each, rank: seeded(seed, each.key) }))
    .toSorted(
      (one, other) =>
        one.rank - other.rank ||
        (one.key < other.key ? -1 : one.key > other.key ? 1 : 0),
    )
    .map(({ item }) => item);
}

const sharing = (specification: TestSpecification): boolean =>
  !specification.project.config.isolate;

export class ShardsByDuration extends BaseSequencer {
  override async sort(
    specifications: TestSpecification[],
  ): Promise<TestSpecification[]> {
    const inBaseOrder = BaseSequencer.prototype.sort.bind(this);
    const sorted = await inBaseOrder(specifications);
    const shared = sorted.filter(sharing);
    const { seed } = this.ctx.config.sequence;
    if (shared.length === 0 || seed === undefined) {
      return sorted;
    }
    console.log(
      `The test files that share their workers run in the order of seed ${seed}; run them in it again with --sequence.seed=${seed}`,
    );
    return [
      ...shuffledBy(shared, seed, (specification) =>
        path
          .relative(this.ctx.config.root, specification.moduleId)
          .replaceAll('\\', '/'),
      ),
      ...sorted.filter((specification) => !sharing(specification)),
    ];
  }

  override async shard(
    specifications: TestSpecification[],
  ): Promise<TestSpecification[]> {
    const { root, shard } = this.ctx.config;
    if (shard === undefined) {
      return specifications;
    }
    const fileOf = (specification: TestSpecification) =>
      path.relative(root, specification.moduleId).replaceAll('\\', '/');
    const files = specifications.map((specification) => ({
      file: fileOf(specification),
      project: specification.project.name,
      workers: workersToWeighBy(specification.project.name),
    }));
    const shards = balancedShards(
      weightsOf(files, readDurations()[process.platform] ?? {}),
      shard.count,
    );
    const taken = new Set(shards[shard.index - 1]);
    return specifications.filter((specification) =>
      taken.has(fileOf(specification)),
    );
  }
}
