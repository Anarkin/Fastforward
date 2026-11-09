import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { PromptPopup } from '../../../shell/page/promptPopup';
import { noop } from '../../fixtures';

const prompted = (secret?: boolean) =>
  renderToStaticMarkup(
    <PromptPopup
      title="Password"
      message="a.zip is encrypted."
      label="Password"
      confirm="Open"
      problemOf={() => undefined}
      {...(secret !== undefined && { secret })}
      onConfirm={noop}
      onCancel={noop}
    />,
  );

suite('Prompt popup', () => {
  test('hides what is typed when it asks for a secret, as a password, and shows it otherwise', () => {
    assert.match(prompted(true), /<input class="prompt-input" type="password"/);
    assert.match(prompted(), /<input class="prompt-input" type="text"/);
  });
});
