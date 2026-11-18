import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BrowserWindow } from 'electron';
import {
  _electron,
  type ElectronApplication,
  type Page,
} from 'playwright-core';
import { afterAll, beforeAll, inject } from 'vitest';
import { appFolder, closeOrKill, schemeAsked } from '../e2e/appLaunch';
import { waitFor } from '../helpers/fixtures';
import { perfBuild, type PerfData } from './perfData';
import { sleep } from './perfInput';
import {
  frameSummary,
  framesIn,
  inputLatency,
  inputSteps,
  mainThreadSummary,
  moduleAt,
  spanBetween,
  topScripts,
  traceEventsOf,
  type SourceOf,
} from './perfTrace';
import { startTracing } from './perfTracing';
import { removeFolder, tempFolder } from '../helpers/tempFolders';
import {
  resultSuffix,
  type SavedResult,
  type ScenarioResult,
} from './perfResults';

export interface PerfApp {
  readonly app: ElectronApplication;
  readonly page: Page;
}

const unthrottled = [
  '--enable-gpu-benchmarking',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion',
];

const uncapped = ['--disable-frame-rate-limit', '--disable-gpu-vsync'];

const categories = [
  'benchmark',
  'blink.user_timing',
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'gpu',
  'input',
  'latencyInfo',
  'v8.execute',
  'viz',
];

const sampled = [
  'disabled-by-default-v8.cpu_profiler',
  'disabled-by-default-devtools.timeline.stack',
];

const startMark = 'fastforward-perf-start';
const endMark = 'fastforward-perf-end';

const isUncapped = () => process.env.FASTFORWARD_PERF_UNCAPPED === '1';

const isSampled = () => process.env.FASTFORWARD_PERF_PROFILE === '1';

const asked = () =>
  (process.env.FASTFORWARD_PERF_CATEGORIES ?? '').split(',').filter(Boolean);

function withGlidingAsked(settings: unknown): unknown {
  const gliding = process.env.FASTFORWARD_PERF_SMOOTH;
  if (
    gliding === undefined ||
    typeof settings !== 'object' ||
    settings === null
  ) {
    return settings;
  }
  const scrolling: unknown = Reflect.get(settings, 'scrolling');
  return {
    ...settings,
    scrolling: {
      ...(typeof scrolling === 'object' ? scrolling : {}),
      smooth: gliding === '1',
    },
  };
}

export function perfData(): PerfData {
  return inject('perfData');
}

export function launchedForPerf(
  { state, settings }: { readonly state: unknown; readonly settings: unknown },
  ready: (page: Page) => Promise<void>,
): () => PerfApp {
  let folder: string | undefined;
  let launched: PerfApp | undefined;

  beforeAll(async () => {
    folder = tempFolder('perf');
    const profile = path.join(folder, 'profile');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(profile, 'state.json'), JSON.stringify(state));
    fs.writeFileSync(
      path.join(profile, 'settings.user.json'),
      JSON.stringify(withGlidingAsked(settings)),
    );
    const app = await _electron.launch({
      args: [
        ...unthrottled,
        ...(isUncapped() ? uncapped : []),
        perfBuild,
        `--user-data-dir=${profile}`,
      ],
      cwd: appFolder,
      ...schemeAsked(),
    });
    const page = await app.firstWindow();
    launched = { app, page };
    await waitFor(
      () =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some((window) => window.isVisible()),
        ),
      'the window to show',
    );
    await ready(page);
  });

  afterAll(async () => {
    if (launched !== undefined) {
      await closeOrKill(launched.app);
    }
    if (folder !== undefined) {
      removeFolder(folder);
    }
  });

  return () => {
    if (launched === undefined) {
      throw new Error('The app did not start');
    }
    return launched;
  };
}

const bundles = new Map<string, readonly string[] | undefined>();

const bundledSource: SourceOf = (url, line) => {
  const prefix = 'fastforward://app/';
  if (!url.startsWith(prefix)) {
    return undefined;
  }
  const file = url.slice(prefix.length).replace(/[?#].*$/, '');
  if (!bundles.has(file)) {
    const bundle = path.join(perfBuild, 'dist', file);
    bundles.set(
      file,
      fs.existsSync(bundle)
        ? fs.readFileSync(bundle, 'utf8').split('\n')
        : undefined,
    );
  }
  const lines = bundles.get(file);
  return lines === undefined ? undefined : moduleAt(lines, line);
};

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function rendererOf({
  app,
  page,
}: PerfApp): Promise<{ readonly pid: number; readonly hz: number }> {
  const window = await app.browserWindow(page);
  const { pid, id } = await window.evaluate((browserWindow: BrowserWindow) => ({
    pid: browserWindow.webContents.getOSProcessId(),
    id: browserWindow.id,
  }));
  const hz = await app.evaluate(({ BrowserWindow, screen }, windowId) => {
    const shown = BrowserWindow.fromId(windowId);
    return shown === null
      ? screen.getPrimaryDisplay().displayFrequency
      : screen.getDisplayMatching(shown.getBounds()).displayFrequency;
  }, id);
  return { pid, hz };
}

function observeLongFrames(): void {
  const entries: unknown[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      entries.push(entry.toJSON());
    }
  });
  observer.observe({ type: 'long-animation-frame' });
  Reflect.set(window, 'perfLongFrames', { entries, observer });
}

function longFramesSeen(): unknown[] {
  const seen: unknown = Reflect.get(window, 'perfLongFrames');
  if (typeof seen !== 'object' || seen === null) {
    return [];
  }
  const observer: unknown = Reflect.get(seen, 'observer');
  if (observer instanceof PerformanceObserver) {
    observer.disconnect();
  }
  const entries: unknown = Reflect.get(seen, 'entries');
  return Array.isArray(entries) ? entries : [];
}

export async function measure(
  perf: PerfApp,
  name: string,
  act: () => Promise<void>,
  settleMs = 500,
): Promise<ScenarioResult> {
  const { page } = perf;
  const results = inject('perfResults');
  const slug = slugOf(name);
  const { pid, hz } = await rendererOf(perf);
  await page.evaluate(observeLongFrames);
  const stopTracing = await startTracing(page, [
    ...categories,
    ...(isSampled() ? sampled : []),
    ...asked(),
  ]);
  const startedAt = Date.now();
  await page.evaluate((mark) => performance.mark(mark), startMark);
  await act();
  await sleep(settleMs);
  await page.evaluate((mark) => performance.mark(mark), endMark);
  const longAnimationFrames = await page.evaluate(longFramesSeen);
  const traceFile = path.join(results, `${slug}.trace.json`);
  const trace = await stopTracing();
  fs.writeFileSync(traceFile, trace);
  const traced = traceEventsOf(trace);
  if (traced === undefined) {
    throw new Error(`The trace of ${name} has no events`);
  }
  const span = spanBetween(traced, pid, startMark, endMark);
  const result: ScenarioResult = {
    name,
    hz: isUncapped() ? 'uncapped' : hz,
    seconds: Math.round((span.end - span.start) / 100_000) / 10,
    frames: frameSummary(framesIn(traced, pid, span)),
    mainThread: mainThreadSummary(traced, pid, span, 1000 / hz),
    input: inputLatency(traced, pid, span),
    steps: inputSteps(traced, pid, span),
    scripts: topScripts(traced, pid, span, 3, bundledSource),
    longAnimationFrames: longAnimationFrames.length,
  };
  const saved: SavedResult = { startedAt, result, longAnimationFrames };
  fs.writeFileSync(
    path.join(results, `${slug}${resultSuffix}`),
    `${JSON.stringify(saved, null, 2)}\n`,
  );
  return result;
}
