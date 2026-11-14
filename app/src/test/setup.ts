import { afterAll, afterEach, expect } from 'vitest';
import { ProgramsStarted } from './helpers/programs';
import { assertNoFoldersLeft } from './helpers/repositories';

const programs = new ProgramsStarted(expect.getState().testPath ?? '');

afterEach(() => {
  programs.testEnded();
});
afterAll(() => {
  programs.fileEnded();
});
afterAll(() => assertNoFoldersLeft(), 10_000);
