import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, suite, test } from 'vitest';
import { removeFolder, tempFolder } from '../helpers/tempFolders';

type Gh = (...args: string[]) => Promise<string>;

interface Report {
  readonly testResults: readonly {
    readonly name: string;
    readonly startTime: number;
    readonly endTime: number;
  }[];
}

interface TestDurations {
  readonly artifactPrefix: string;
  readonly reportFile: string;
  readonly secondsOfReport: (report: Report) => Record<string, number>;
  readonly latestDurations: (
    gh: Gh,
    folder: string,
  ) => Promise<Record<string, Record<string, number>>>;
}

async function loadTestDurations(): Promise<TestDurations> {
  const loaded: TestDurations = await import(
    pathToFileURL(
      path.join(__dirname, '..', '..', '..', 'scripts', 'testDurations.mts'),
    ).href
  );
  return loaded;
}

const reportOf = (...files: readonly [string, number][]): Report => ({
  testResults: files.map(([name, seconds]) => ({
    name,
    startTime: 1_000_000,
    endTime: 1_000_000 + seconds * 1000,
  })),
});

suite('Durations of the test files read from CI', () => {
  let folder: string | undefined;

  afterEach(() => {
    if (folder !== undefined) {
      removeFolder(folder);
      folder = undefined;
    }
  });

  test('takes each file by its path from src/test, on every runner, to a tenth of a second', async () => {
    const { secondsOfReport } = await loadTestDurations();
    assert.deepStrictEqual(
      secondsOfReport(
        reportOf(
          [
            '/home/runner/work/Fastforward/Fastforward/app/src/test/e2e/appCursor.electron.test.ts',
            104.0549,
          ],
          [
            'D:\\a\\Fastforward\\Fastforward\\app\\src\\test\\src\\lib\\shared\\strings.test.ts',
            0.26,
          ],
          ['/elsewhere/outside.test.ts', 3],
        ),
      ),
      {
        'src/test/e2e/appCursor.electron.test.ts': 104.1,
        'src/test/src/lib/shared/strings.test.ts': 0.3,
      },
    );
  });

  test('reads the durations of the last run of CI on main that passed, every shard of each runner merged into its platform, sorted', async () => {
    const { artifactPrefix, reportFile, latestDurations } =
      await loadTestDurations();
    const downloads = tempFolder('test-durations');
    folder = downloads;
    const calls: string[][] = [];
    const artifacts: Record<string, Report> = {
      [`${artifactPrefix}Linux-0`]: reportOf([
        '/work/app/src/test/b.test.ts',
        2,
      ]),
      [`${artifactPrefix}Linux-1`]: reportOf([
        '/work/app/src/test/a.test.ts',
        1,
      ]),
      [`${artifactPrefix}Windows-6`]: reportOf([
        'D:\\work\\app\\src\\test\\a.test.ts',
        4,
      ]),
      [`${artifactPrefix}macOS-12`]: reportOf([
        '/Users/runner/app/src/test/a.test.ts',
        3,
      ]),
    };
    const gh: Gh = async (...args) => {
      calls.push(args);
      if (args[1] === 'list') {
        return JSON.stringify([{ databaseId: 42 }]);
      }
      for (const [name, report] of Object.entries(artifacts)) {
        fs.mkdirSync(path.join(downloads, name));
        fs.writeFileSync(
          path.join(downloads, name, reportFile),
          JSON.stringify(report),
        );
      }
      return '';
    };
    const durations = await latestDurations(gh, downloads);
    assert.deepStrictEqual(durations, {
      darwin: { 'src/test/a.test.ts': 3 },
      linux: { 'src/test/a.test.ts': 1, 'src/test/b.test.ts': 2 },
      win32: { 'src/test/a.test.ts': 4 },
    });
    assert.deepStrictEqual(Object.keys(durations), [
      'darwin',
      'linux',
      'win32',
    ]);
    assert.deepStrictEqual(Object.keys(durations.linux ?? {}), [
      'src/test/a.test.ts',
      'src/test/b.test.ts',
    ]);
    assert.deepStrictEqual(calls, [
      [
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
      ],
      [
        'run',
        'download',
        '42',
        '--pattern',
        `${artifactPrefix}*`,
        '--dir',
        downloads,
      ],
    ]);
  });

  test('says so when no run of CI on main has passed', async () => {
    const { latestDurations } = await loadTestDurations();
    await assert.rejects(
      latestDurations(async () => '[]', 'unused'),
      /No run of CI on main has passed/,
    );
  });
});
