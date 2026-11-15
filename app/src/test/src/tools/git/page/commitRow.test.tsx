import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { isValidElement } from 'react';
import {
  CommitRow,
  SoloButton,
} from '../../../../../tools/git/page/commitList';
import { defaultDateFormat, formatDate } from '../../../../../lib/page/dates';
import { createShellStore, ShellStore } from '../../../../../shell/page/store';
import { createGitStore, GitStore } from '../../../../../tools/git/page/store';
import { emptyTabView } from '../../../../../tools/git/page/tabView';
import { gitStore } from '../../../../helpers/componentFixtures';
import { commitInfo, renderedBy } from '../../../../helpers/fixtures';
import { renderToStaticMarkup, noop, plainClick } from './commitListFixtures';

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

suite('Commit row', () => {
  test('shows the subject, author, the date it was last committed and bubbles, but no file count', () => {
    let picked: string | undefined;
    const props = {
      commit: commitInfo('a', {
        subject: 'Fix it',
        authorName: 'Ann',
        commitDate: Date.UTC(2026, 8, 30, 11, 56),
      }),
      selected: undefined,
      indent: 26,
      onSelect: (hash: string) => (picked = hash),
    };
    const store = gitStore({
      head: 'main',
      headCommit: 'a',
      refs: [{ kind: 'branch', name: 'main', commit: 'a' }],
    });
    const html = renderToStaticMarkup(
      <GitStore value={store}>
        <CommitRow {...props} />
      </GitStore>,
    );
    assert.match(
      html,
      /^<div class="commit checked-out" style="padding-left:26px">/,
    );
    assert.match(html, /<span class="subject">Fix it<\/span><\/div>/);
    assert.match(html, /<span class="author">Ann<\/span>/);
    assert.ok(
      html.includes(
        `<span class="date">${formatDate(props.commit.commitDate, defaultDateFormat)}</span>`,
      ),
    );
    assert.ok(
      renderToStaticMarkup(
        <ShellStore
          value={createShellStore(noop, { dateFormat: 'DD.MM.YYYY' })}
        >
          <GitStore value={store}>
            <CommitRow {...props} />
          </GitStore>
        </ShellStore>,
      ).includes(
        `<span class="date">${formatDate(props.commit.commitDate, 'DD.MM.YYYY')}</span>`,
      ),
    );
    assert.match(html, />main</);
    assert.doesNotMatch(html, /class="count"/);
    const row = renderedBy(CommitRow, props, { git: store });
    assert.ok(
      isValidElement<{ onClick: (event: typeof plainClick) => void }>(row),
    );
    row.props.onClick(plainClick);
    assert.strictEqual(picked, 'a');
  });

  test('puts a corner it is given on its first line after the subject, as the whole message of a commit puts its pin or close button there', () => {
    const html = renderToStaticMarkup(
      <CommitRow
        commit={commitInfo('a')}
        selected={undefined}
        indent={8}
        onSelect={() => undefined}
        corner={<span className="corner" />}
      />,
    );
    assert.match(
      html,
      /^<div class="commit"[^>]*><div class="commit-line"><span class="subject">a<\/span><span class="corner"><\/span><\/div>/,
    );
  });

  test('puts what it is given after its bubbles, as the whole message of a commit adds the rest of the message there', () => {
    const html = renderToStaticMarkup(
      <GitStore
        value={gitStore({
          refs: [{ kind: 'branch', name: 'main', commit: 'a' }],
        })}
      >
        <CommitRow
          commit={commitInfo('a')}
          selected={undefined}
          indent={8}
          onSelect={() => undefined}
        >
          <div className="added" />
        </CommitRow>
      </GitStore>,
    );
    assert.match(html, />main<.*<div class="added"><\/div><\/div>$/s);
  });

  test('marks a stash with a bubble, not its place among the stashes, which changes as they come and go, and offers no menu, as a stash can be neither checked out nor bookmarked', () => {
    const props = {
      commit: commitInfo('s', { subject: 'On main: kept' }),
      selected: undefined,
      indent: 0,
      onSelect: noop,
    };
    const stashed = gitStore({
      stashes: [{ name: 'stash@{0}', commit: 's', message: 'On main: kept' }],
    });
    const html = renderToStaticMarkup(
      <GitStore value={stashed}>
        <CommitRow {...props} />
      </GitStore>,
    );
    assert.match(html, /<span class="badge stash">stash<\/span>/);
    assert.doesNotMatch(html, /@\{/);
    const row = renderedBy(CommitRow, props, { git: stashed });
    assert.ok(isValidElement<{ onContextMenu?: unknown }>(row));
    assert.strictEqual(row.props.onContextMenu, undefined);
    const commitRow = renderedBy(CommitRow, props);
    assert.ok(isValidElement<{ onContextMenu?: unknown }>(commitRow));
    assert.strictEqual(typeof commitRow.props.onContextMenu, 'function');
  });

  test('compares with the commit when clicked with Ctrl', () => {
    const picked: string[] = [];
    const compared: string[] = [];
    const row = renderedBy(CommitRow, {
      commit: commitInfo('a'),
      selected: 'b',
      indent: 0,
      onSelect: (hash: string) => picked.push(hash),
      onCompare: (hash: string) => compared.push(hash),
    });
    assert.ok(
      isValidElement<{ onClick: (event: typeof plainClick) => void }>(row),
    );
    row.props.onClick({ ...plainClick, ctrlKey: true });
    assert.deepStrictEqual([picked, compared], [[], ['a']]);
  });
});
