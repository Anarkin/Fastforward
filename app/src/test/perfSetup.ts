import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestProject } from 'vitest/node';
import { perfBuild, perfData, type PerfData } from './perfData';
import { resultSuffix, resultsTable, type SavedResult } from './perfTrace';

declare module 'vitest' {
  export interface ProvidedContext {
    perfData: PerfData;
    perfResults: string;
  }
}

const appFolder = path.join(__dirname, '..', '..');

function assertProductionBuild(): void {
  const dist = path.join(perfBuild, 'dist');
  if (
    !fs.existsSync(path.join(dist, 'webview.js')) ||
    fs.existsSync(path.join(dist, 'webview.js.map'))
  ) {
    throw new Error(
      `The frames of a development build say little, as React checks every render; run npm run perf, which builds for production into ${perfBuild} first`,
    );
  }
}

function isSaved(value: unknown): value is SavedResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'startedAt') === 'number' &&
    typeof Reflect.get(value, 'result') === 'object'
  );
}

function savedResults(folder: string): SavedResult[] {
  return fs
    .readdirSync(folder)
    .filter((file) => file.endsWith(resultSuffix))
    .flatMap((file) => {
      const saved: unknown = JSON.parse(
        fs.readFileSync(path.join(folder, file), 'utf8'),
      );
      return isSaved(saved) ? [saved] : [];
    })
    .toSorted((a, b) => a.startedAt - b.startedAt);
}

export default function setup(project: TestProject): () => void {
  assertProductionBuild();
  fs.copyFileSync(
    path.join(appFolder, 'package.json'),
    path.join(perfBuild, 'package.json'),
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const results = path.join(appFolder, 'perf-results', stamp);
  fs.mkdirSync(results, { recursive: true });
  project.provide('perfData', perfData());
  project.provide('perfResults', results);
  return () => {
    const saved = savedResults(results);
    if (saved.length === 0) {
      return;
    }
    const table = resultsTable(saved.map(({ result }) => result));
    fs.writeFileSync(path.join(results, 'results.md'), `# Frames\n\n${table}`);
    console.log(
      `\n${table}\nThe traces are in ${results}; open one in https://ui.perfetto.dev or the Performance panel of DevTools.\n`,
    );
  };
}
