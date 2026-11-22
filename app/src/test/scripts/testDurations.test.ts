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

const byName = (one: string, other: string) =>
  one < other ? -1 : one > other ? 1 : 0;

suite('Durations of the test files read from CI', () => {
  let folder: string | undefined;

  afterEach(() => {
    if (folder !== undefined) {
      removeFolder(folder);
      folder = undefined;
    }
  });

  test('takes each file by its path from src/test, on every runner, to a whole second, so a refresh changes fewer of them', async () => {
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
        'src/test/e2e/appCursor.electron.test.ts': 104,
        'src/test/src/lib/shared/strings.test.ts': 0,
      },
    );
  });

  test('reads the durations of the last run of CI on main that passed, downloading those of every shard at once and merging those of each runner into its platform, sorted', async () => {
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
    let downloading = 0;
    let mostAtOnce = 0;
    const gh: Gh = async (...args) => {
      calls.push(args);
      if (args[1] === 'list') {
        return JSON.stringify([{ databaseId: 42 }]);
      }
      if (args[0] === 'api') {
        return [...Object.keys(artifacts), 'coverage'].join('\n');
      }
      const [, , , , name = '', , into = ''] = args;
      downloading += 1;
      mostAtOnce = Math.max(mostAtOnce, downloading);
      await new Promise((resolve) => setTimeout(resolve, 10));
      fs.mkdirSync(into, { recursive: true });
      fs.writeFileSync(
        path.join(into, reportFile),
        JSON.stringify(artifacts[name]),
      );
      downloading -= 1;
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
    assert.deepStrictEqual(calls.slice(0, 2), [
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
        'api',
        'repos/{owner}/{repo}/actions/runs/42/artifacts?per_page=100',
        '--jq',
        '.artifacts[].name',
      ],
    ]);
    assert.deepStrictEqual(
      calls
        .slice(2)
        .toSorted(([, , , , one = ''], [, , , , other = '']) =>
          byName(one, other),
        ),
      Object.keys(artifacts)
        .toSorted(byName)
        .map((name) => [
          'run',
          'download',
          '42',
          '--name',
          name,
          '--dir',
          path.join(downloads, name),
        ]),
    );
    assert.strictEqual(mostAtOnce, Object.keys(artifacts).length);
  });

  test('refuses the durations of a run in which two shards of a system ran the same file, saying how many files and one of them, as its machines then split the files in different ways and as many files ran on none of them, which the durations would lack: one macOS machine of four did, 204 test files ran on none, and the run passed', async () => {
    const { artifactPrefix, reportFile, latestDurations } =
      await loadTestDurations();
    const downloads = tempFolder('test-durations');
    folder = downloads;
    const artifacts: Record<string, Report> = {
      [`${artifactPrefix}Linux-0`]: reportOf([
        '/work/app/src/test/b.test.ts',
        2,
      ]),
      [`${artifactPrefix}macOS-6`]: reportOf(
        ['/Users/runner/app/src/test/a.test.ts', 3],
        ['/Users/runner/app/src/test/b.test.ts', 1],
        ['/Users/runner/app/src/test/c.test.ts', 1],
      ),
      [`${artifactPrefix}macOS-7`]: reportOf(
        ['/Users/runner/app/src/test/b.test.ts', 2],
        ['/Users/runner/app/src/test/c.test.ts', 2],
        ['/Users/runner/app/src/test/d.test.ts', 1],
      ),
    };
    const gh: Gh = (...args) => {
      if (args[1] === 'list') {
        return Promise.resolve(JSON.stringify([{ databaseId: 42 }]));
      }
      if (args[0] === 'api') {
        return Promise.resolve(Object.keys(artifacts).join('\n'));
      }
      const [, , , , name = '', , into = ''] = args;
      fs.mkdirSync(into, { recursive: true });
      fs.writeFileSync(
        path.join(into, reportFile),
        JSON.stringify(artifacts[name]),
      );
      return Promise.resolve('');
    };
    await assert.rejects(
      latestDurations(gh, downloads),
      /The shards of darwin ran 2 files twice, as src\/test\/b\.test\.ts/,
    );
  });

  test('says so when no run of CI on main has passed', async () => {
    const { latestDurations } = await loadTestDurations();
    await assert.rejects(
      latestDurations(async () => '[]', 'unused'),
      /No run of CI on main has passed/,
    );
  });
});
