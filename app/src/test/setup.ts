import { afterAll, afterEach, expect } from 'vitest';
import { ProgramsStarted } from './helpers/programs';
import { removeTemplates } from './helpers/repositories';
import { assertNoFoldersLeft } from './helpers/tempFolders';

const programs = new ProgramsStarted(expect.getState().testPath ?? '');

afterEach(() => {
  programs.testEnded();
});
afterAll(() => {
  programs.fileEnded();
});
afterAll(() => {
  removeTemplates();
  return assertNoFoldersLeft();
}, 10_000);
