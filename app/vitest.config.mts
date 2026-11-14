import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

const git = 'src/test/**/*.git.test.ts';
const electron = 'src/test/**/*.electron.test.ts';
const shells = 'src/test/**/*.shells.test.ts';
const sevenZip = 'src/test/**/*.7zip.test.ts';
const perf = 'src/test/**/*.perf.test.ts';
const playgrounds = [
  'src/test/scripts/playground/git.git.test.ts',
  'src/test/scripts/playground/files.git.test.ts',
];
const packaging = [
  'src/test/build/build.test.ts',
  'src/test/build/ffScripts.test.ts',
  'src/test/build/installer.test.ts',
];

export default defineConfig({
  test: {
    setupFiles: ['src/test/setup.ts'],
    allowOnly: false,
    maxWorkers: Math.min(8, Math.max(1, availableParallelism() - 1)),
    coverage: {
      include: ['src/**'],
      exclude: ['src/test/**'],
      reporter: ['text', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/test/**/*.test.{ts,tsx}'],
          exclude: [git, electron, shells, sevenZip, perf, ...packaging],
        },
      },
      {
        extends: true,
        test: {
          name: 'shells',
          include: [shells],
          testTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: '7zip',
          include: [sevenZip],
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'packaging',
          include: packaging,
        },
      },
      {
        extends: true,
        test: {
          name: 'git',
          include: [git],
          exclude: playgrounds,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'playground',
          include: playgrounds,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'electron',
          include: [electron],
          setupFiles: ['src/test/e2e/electronSetup.ts'],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'perf',
          include: [perf],
          setupFiles: ['src/test/e2e/electronSetup.ts'],
          globalSetup: ['src/test/perf/perfSetup.ts'],
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
