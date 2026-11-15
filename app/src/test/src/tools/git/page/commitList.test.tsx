import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { isValidElement } from 'react';
import { comparisonOf } from '../../../../../tools/git/shared/comparisons';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import { createGitStore, GitStore } from '../../../../../tools/git/page/store';
import { emptyTabView } from '../../../../../tools/git/page/tabView';
import { renderToStaticMarkup, noop, plainClick } from './commitListFixtures';
import {
  SoloButton,
  WorkingTreeRow,
} from '../../../../../tools/git/page/commitList';
import { withMacKeys } from '../../../../helpers/keys';

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

function clickedHash(
  count: number,
  click = plainClick,
): { selected?: string; compared?: string } {
  const clicked: { selected?: string; compared?: string } = {};
  const row = WorkingTreeRow({
    count,
    selection: undefined,
    indent: 26,
    onSelect: (hash) => (clicked.selected = hash),
    onCompare: (hash) => (clicked.compared = hash),
  });
  assert.ok(isValidElement<{ onClick: (event: typeof click) => void }>(row));
  row.props.onClick(click);
  return clicked;
}

function workingTreeHtml(selection: string): string {
  return renderToStaticMarkup(
    <WorkingTreeRow
      count={1}
      selection={selection}
      indent={0}
      onSelect={noop}
    />,
  );
}

suite('Commit list working tree row', () => {
  test('shows a clean working tree, which clicking selects, as the keys do', () => {
    const html = renderToStaticMarkup(
      <WorkingTreeRow
        count={0}
        selection={undefined}
        indent={26}
        onSelect={noop}
      />,
    );
    assert.match(
      html,
      /^<div [^>]*class="commit working-tree empty\s*"><div class="commit-line"><span class="subject">No uncommitted changes<\/span><\/div><\/div>$/,
    );
    assert.deepStrictEqual(clickedHash(0), { selected: workingTreeHash });
  });

  test('shows how many files changed, and clicking selects them', () => {
    const html = renderToStaticMarkup(
      <WorkingTreeRow
        count={3}
        selection={undefined}
        indent={26}
        onSelect={noop}
      />,
    );
    assert.doesNotMatch(html, /empty/);
    assert.match(
      html,
      /<div class="commit-line"><span class="subject">3 uncommitted changes<\/span><\/div><\/div>$/,
    );
    assert.match(
      renderToStaticMarkup(
        <WorkingTreeRow
          count={1}
          selection={undefined}
          indent={26}
          onSelect={noop}
        />,
      ),
      /<span class="subject">1 uncommitted change<\/span>/,
    );
    assert.deepStrictEqual(clickedHash(3), { selected: workingTreeHash });
  });

  test('compares with the working tree when clicked with Ctrl, or Cmd on macOS', () => {
    assert.deepStrictEqual(clickedHash(3, { ...plainClick, ctrlKey: true }), {
      compared: workingTreeHash,
    });
    assert.deepStrictEqual(
      withMacKeys(() => clickedHash(0, { ...plainClick, metaKey: true })),
      { compared: workingTreeHash },
    );
  });

  test('shows the working tree selected as either side of a comparison', () => {
    assert.match(
      workingTreeHtml(comparisonOf(workingTreeHash, 'a')),
      /class="commit working-tree\s+selected compare-from"/,
    );
    assert.match(
      workingTreeHtml(comparisonOf('a', workingTreeHash)),
      /class="commit working-tree\s+selected"/,
    );
  });
});
