import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

const git = 'src/test/**/*.git.test.ts';
const electron = 'src/test/**/*.electron.test.ts';

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
          exclude: [git, electron],
        },
      },
      {
        extends: true,
        test: {
          name: 'git',
          include: [git],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'electron',
          include: [electron],
          setupFiles: ['src/test/electronSetup.ts'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
