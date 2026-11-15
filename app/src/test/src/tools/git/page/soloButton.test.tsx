import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { createGitStore, GitStore } from '../../../../../tools/git/page/store';
import { emptyTabView } from '../../../../../tools/git/page/tabView';
import { renderToStaticMarkup, noop } from './commitListFixtures';
import { SoloButton } from '../../../../../tools/git/page/soloButton';

function soloButton(applying: boolean): string {
  return renderToStaticMarkup(
    <GitStore
      value={createGitStore(noop, {
        solo: true,
        tab: { ...emptyTabView, applyingSolo: applying },
      })}
    >
      <SoloButton />
    </GitStore>,
  );
}

suite('Solo button', () => {
  test('spins its icon and takes no clicks while the history reloads', () => {
    const idle = soloButton(false);
    assert.match(idle, /class="nav-button toggle active\s*"/);
    assert.doesNotMatch(idle, /disabled/);
    const applying = soloButton(true);
    assert.match(applying, /class="nav-button toggle active running"/);
    assert.match(applying, /disabled=""/);
    assert.match(applying, /<span class="spin-icon"><svg/);
  });
});
