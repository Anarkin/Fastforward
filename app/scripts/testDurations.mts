import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ghCli, type Gh } from './ciRun.mts';

export type Durations = Readonly<
  Partial<Record<NodeJS.Platform, Readonly<Record<string, number>>>>
>;

export const durationsFile = path.join(
  import.meta.dirname,
  '..',
  'src',
  'test',
  'durations.json',
);

export const artifactPrefix = 'durations-';
export const reportFile = 'test-durations.json';

const platformsOfRunners: Readonly<Record<string, NodeJS.Platform>> = {
  Linux: 'linux',
  macOS: 'darwin',
  Windows: 'win32',
};

interface Report {
  readonly testResults: readonly {
    readonly name: string;
    readonly startTime: number;
    readonly endTime: number;
  }[];
}

const sortedEntries = <T,>(record: Readonly<Record<string, T>>) =>
  Object.entries(record).toSorted(([one], [other]) =>
    one < other ? -1 : one > other ? 1 : 0,
  );

export function secondsOfReport(report: Report): Record<string, number> {
  return Object.fromEntries(
    report.testResults.flatMap(({ name, startTime, endTime }) => {
      const slashed = name.replaceAll('\\', '/');
      const at = slashed.indexOf('/src/test/');
      return at === -1
        ? []
        : [
            [
              slashed.slice(at + 1),
              Math.round((endTime - startTime) / 100) / 10,
            ],
          ];
    }),
  );
}

export async function latestDurations(
  gh: Gh,
  folder: string,
): Promise<Durations> {
  const [run]: readonly { readonly databaseId: number }[] = JSON.parse(
    await gh(
      'run',
      'list',
      '--workflow',
      'ci.yml',
      '--branch',
      'main',
      '--status',
      'success',
      '--limit',
      '1',
      '--json',
      'databaseId',
    ),
  );
  if (run === undefined) {
    throw new Error('No run of CI on main has passed to read durations from');
  }
  await gh(
    'run',
    'download',
    String(run.databaseId),
    '--pattern',
    `${artifactPrefix}*`,
    '--dir',
    folder,
  );
  const byPlatform: Partial<Record<NodeJS.Platform, Record<string, number>>> =
    {};
  for (const artifact of fs.readdirSync(folder)) {
    const [runner = ''] = artifact.slice(artifactPrefix.length).split('-');
    const platform = platformsOfRunners[runner];
    const report = path.join(folder, artifact, reportFile);
    if (platform !== undefined && fs.existsSync(report)) {
      Object.assign(
        (byPlatform[platform] ??= {}),
        secondsOfReport(JSON.parse(fs.readFileSync(report, 'utf8'))),
      );
    }
  }
  return Object.fromEntries(
    sortedEntries(byPlatform).map(([platform, seconds]) => [
      platform,
      Object.fromEntries(sortedEntries(seconds)),
    ]),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-durations-'));
  try {
    const durations = await latestDurations(ghCli, folder);
    fs.writeFileSync(durationsFile, `${JSON.stringify(durations, null, 2)}\n`);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
