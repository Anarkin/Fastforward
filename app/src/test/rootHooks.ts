import { assertNoFoldersLeft } from './repositories';

// Mocha runs root hooks after each file in parallel mode, and after the run
// otherwise; a module-level hook would only attach to the first file a worker
// loads
export const mochaHooks = {
  async afterAll(this: Mocha.Context) {
    this.timeout(10_000);
    await assertNoFoldersLeft();
  },
};
