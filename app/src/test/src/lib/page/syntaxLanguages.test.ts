import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { policyOfPage } from '../../../helpers/pageSources';

suite('Syntax', () => {
  test('may run the Oniguruma engine by the page policy, as it is WebAssembly, which the tests run without the policy', () => {
    assert.ok(policyOfPage().get('script-src')?.includes("'wasm-unsafe-eval'"));
  });
});
