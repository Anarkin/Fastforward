import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { policyOfPage } from '../../../helpers/pageSources';

suite('The page', () => {
  test('lets nothing it shows set where its links lead or send a form anywhere, as it shows content from outside the app', () => {
    const policy = policyOfPage();
    assert.deepStrictEqual(
      [policy.get('base-uri'), policy.get('form-action')],
      [["'none'"], ["'none'"]],
    );
  });
});
