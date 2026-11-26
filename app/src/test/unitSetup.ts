import { afterAll, beforeAll, vi } from 'vitest';
import { leaksSince, stateNow } from './helpers/leaks';
import {
  letGoOfThePointer,
  loadPageLibrariesAsInTheApp,
} from './helpers/pageLibraries';

vi.resetModules();

vi.mock('../components/syntax/page/onigWasm', () => ({
  onigWasm: () => import('shiki/wasm'),
}));

beforeAll(async () => {
  await loadPageLibrariesAsInTheApp();
  letGoOfThePointer();
});

const before = stateNow();

afterAll(() => {
  const leaks = leaksSince(before);
  if (leaks.length > 0) {
    throw new Error(
      `This file left changed ${leaks.join(', ')}, which the files run after it in the same worker would find changed: put each back once done`,
    );
  }
});
