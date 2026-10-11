import { assertNoFoldersLeft } from './repositories';

export const mochaHooks = {
  async afterAll(this: Mocha.Context) {
    this.timeout(10_000);
    await assertNoFoldersLeft();
  },
};
