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

export class ShardsByDuration extends BaseSequencer {
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
      workers: specification.project.config.maxWorkers,
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
