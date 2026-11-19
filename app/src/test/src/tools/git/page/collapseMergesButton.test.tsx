import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { suite, test } from 'vitest';
import { createGitStore, GitStore } from '../../../../../tools/git/page/store';
import { renderToStaticMarkup } from './commitListFixtures';
import { CollapseMergesButton } from '../../../../../tools/git/page/collapseMergesButton';
import type { GitToHost } from '../../../../../tools/git/shared/protocol';
import { renderedInGit } from '../../../../helpers/componentFixtures';

function drawn(collapseMerges: boolean, post: (message: GitToHost) => void) {
  const store = createGitStore(post, { collapseMerges });
  return {
    html: renderToStaticMarkup(
      <GitStore value={store}>
        <CollapseMergesButton />
      </GitStore>,
    ),
    button: renderedInGit(store, CollapseMergesButton, {}),
  };
}

suite('Collapse merges button', () => {
  test('collapses the merges of the history by a button of its own above the commits, pressed while they are collapsed and named by its tooltip, rather than by the one item of a menu of three dots', () => {
    const posted: GitToHost[] = [];
    const on = drawn(true, (message) => posted.push(message));
    assert.match(
      on.html,
      /^<button class="nav-button toggle active" aria-label="Collapse merge commits" data-tip="Collapse merge commits" aria-pressed="true"><svg/,
    );
    const off = drawn(false, (message) => posted.push(message));
    assert.match(
      off.html,
      /^<button class="nav-button toggle " aria-label="Collapse merge commits" data-tip="Collapse merge commits" aria-pressed="false"><svg/,
    );
    assert.ok(isValidElement<{ onClick: () => void }>(on.button));
    on.button.props.onClick();
    assert.ok(isValidElement<{ onClick: () => void }>(off.button));
    off.button.props.onClick();
    assert.deepStrictEqual(
      posted.map((message) =>
        message.type === 'setCollapseMerges' ? message.collapse : message.type,
      ),
      [false, true],
    );
  });
});
