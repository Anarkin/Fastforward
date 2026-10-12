import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import {
  BranchActions,
  BubbleActions,
  TagActions,
  TagPushAction,
  CheckedOutBranch,
  CommitBubble,
  HeadBubble,
  RefBubble,
} from '../../webview/bubbles';
import { OpenContextMenu, type MenuTarget } from '../../webview/contextMenu';
import { classesOf, noop, renderedBy, tagWith } from '../fixtures';

const idle = { pulling: false, pushing: false, onPull: noop, onPush: noop };

function onMain(node: React.ReactNode): string {
  return renderToStaticMarkup(
    <BranchActions.Provider value={idle}>
      <CheckedOutBranch.Provider value="main">{node}</CheckedOutBranch.Provider>
    </BranchActions.Provider>,
  );
}

function tagged(name: string, onRemote: string[]): string {
  return renderToStaticMarkup(
    <TagActions.Provider
      value={{
        remote: 'origin',
        onRemote: new Set(onRemote),
        pushing: undefined,
        onPush: noop,
      }}
    >
      <RefBubble info={{ kind: 'tag', name }} actions />
    </TagActions.Provider>,
  );
}

suite('Bubbles', () => {
  test('marks a commit bubble apart from the commit rows', () => {
    const html = renderToStaticMarkup(<CommitBubble hash={'a'.repeat(40)} />);
    const classes = classesOf(tagWith(html, '', 'badge'));
    assert.ok(classes.has('hash'));
    assert.ok(!classes.has('commit'));
  });

  test('marks only the branch checked out, and a ref gone missing', () => {
    const html = renderToStaticMarkup(
      <CheckedOutBranch.Provider value="main">
        <RefBubble info={{ kind: 'branch', name: 'main' }} />
        <RefBubble info={{ kind: 'tag', name: 'main' }} />
        <RefBubble info={{ kind: 'branch', name: 'gone' }} missing />
        <CommitBubble hash={'b'.repeat(40)} />
      </CheckedOutBranch.Provider>,
    );
    assert.match(
      tagWith(html, '', 'badge', 'branch', 'checked-out'),
      /title="main, checked out"/,
    );
    assert.ok(!classesOf(tagWith(html, '', 'badge', 'tag')).has('checked-out'));
    tagWith(
      html,
      'title="gone doesn&#x27;t exist anymore"',
      'badge',
      'missing',
    );
    assert.match(
      html,
      new RegExp(`title="Commit ${'b'.repeat(40)}">bbbbbbb</span>`),
    );
  });

  test('puts pull and push on the bubble of the checked-out branch where asked, and on no other bubble', () => {
    const withActions = onMain(
      <RefBubble info={{ kind: 'branch', name: 'main' }} actions />,
    );
    const bubble = tagWith(
      withActions,
      '',
      'badge',
      'checked-out',
      'with-actions',
    );
    assert.match(bubble, /title="main, checked out"/);
    assert.match(
      withActions,
      /^<span[^>]*>main<span class="bubble-actions"><button class="bubble-action[^"]*" title="Pull:[^"]*" tabindex="-1">.*?<\/button><button class="bubble-action[^"]*" title="Push:[^"]*" tabindex="-1">.*?<\/button><\/span><\/span>$/,
    );
    for (const without of [
      <RefBubble key="a" info={{ kind: 'branch', name: 'main' }} />,
      <RefBubble key="b" info={{ kind: 'branch', name: 'feature' }} actions />,
      <RefBubble
        key="c"
        info={{ kind: 'remote', name: 'origin/main' }}
        actions
      />,
    ]) {
      assert.doesNotMatch(onMain(without), /bubble-action|with-actions/);
    }
  });

  test('names what pull and push do without naming the branch, as they sit on its bubble', () => {
    const html = renderToStaticMarkup(<BubbleActions {...idle} />);
    tagWith(
      html,
      'title="Pull: fetch every remote, then fast-forward to the upstream"',
      'bubble-action',
    );
    tagWith(
      html,
      'title="Push: send the new commits to the upstream, or publish to the only remote when there is none"',
      'bubble-action',
    );
  });

  test('pulls and pushes from the bubble without selecting its row or taking the keys from the list', () => {
    const calls: string[] = [];
    const actions = renderedBy(BubbleActions, {
      ...idle,
      onPull: () => calls.push('pull'),
      onPush: () => calls.push('push'),
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(actions));
    for (const button of actions.props.children) {
      assert.ok(
        isValidElement<{
          onClick: (event: { stopPropagation: () => void }) => void;
          onMouseDown: (event: { preventDefault: () => void }) => void;
        }>(button),
      );
      button.props.onMouseDown({
        preventDefault: () => calls.push('kept focus'),
      });
      button.props.onClick({
        stopPropagation: () => calls.push('row left alone'),
      });
    }
    assert.deepStrictEqual(calls, [
      'kept focus',
      'row left alone',
      'pull',
      'kept focus',
      'row left alone',
      'push',
    ]);
  });

  test('disables pull and push on the bubble while each runs, marking it as running', () => {
    for (const [running, title] of [
      [{ pulling: true }, 'Pull:'],
      [{ pushing: true }, 'Push:'],
    ] as const) {
      const html = renderToStaticMarkup(
        <BubbleActions {...idle} {...running} />,
      );
      const busy = tagWith(html, `title="${title}`, 'bubble-action', 'running');
      assert.match(busy, /disabled=""/);
      const other = tagWith(
        html,
        `title="${title === 'Pull:' ? 'Push:' : 'Pull:'}`,
        'bubble-action',
      );
      assert.ok(!classesOf(other).has('running'));
      assert.doesNotMatch(other, /disabled/);
    }
  });

  test('puts a push button on a tag missing from the remote it would go to, naming both, and none on a tag already there or without that remote known', () => {
    const missing = tagged('v1', ['v0']);
    tagWith(missing, '', 'badge', 'tag', 'with-actions');
    tagWith(missing, 'title="Push v1 to origin"', 'bubble-action', 'push');
    assert.doesNotMatch(tagged('v1', ['v1']), /bubble-action|with-actions/);
    assert.doesNotMatch(
      renderToStaticMarkup(
        <RefBubble info={{ kind: 'tag', name: 'v1' }} actions />,
      ),
      /bubble-action/,
    );
    assert.doesNotMatch(
      renderToStaticMarkup(
        <TagActions.Provider
          value={{
            remote: 'origin',
            onRemote: new Set(),
            pushing: undefined,
            onPush: noop,
          }}
        >
          <RefBubble info={{ kind: 'tag', name: 'v1' }} />
          <RefBubble info={{ kind: 'remote-tag', name: 'origin/v1' }} actions />
        </TagActions.Provider>,
      ),
      /bubble-action/,
    );
  });

  test('pushes the tag of its bubble without selecting its row or taking the keys from the list, marking only that tag as running while it pushes', () => {
    const calls: string[] = [];
    const action = renderedBy(TagPushAction, {
      tag: 'v1',
      remote: 'origin',
      running: false,
      onPush: (name) => calls.push(`push ${name}`),
    });
    assert.ok(isValidElement<{ children: React.ReactElement }>(action));
    const button = action.props.children;
    assert.ok(
      isValidElement<{
        onClick: (event: { stopPropagation: () => void }) => void;
        onMouseDown: (event: { preventDefault: () => void }) => void;
      }>(button),
    );
    button.props.onMouseDown({
      preventDefault: () => calls.push('kept focus'),
    });
    button.props.onClick({
      stopPropagation: () => calls.push('row left alone'),
    });
    assert.deepStrictEqual(calls, ['kept focus', 'row left alone', 'push v1']);
    const html = renderToStaticMarkup(
      <TagActions.Provider
        value={{
          remote: 'origin',
          onRemote: new Set(),
          pushing: 'v1',
          onPush: noop,
        }}
      >
        <RefBubble info={{ kind: 'tag', name: 'v1' }} actions />
        <RefBubble info={{ kind: 'tag', name: 'v2' }} actions />
      </TagActions.Provider>,
    );
    assert.match(
      tagWith(html, 'title="Push v1 to origin"', 'bubble-action', 'running'),
      /disabled=""/,
    );
    assert.doesNotMatch(
      tagWith(html, 'title="Push v2 to origin"', 'bubble-action'),
      /disabled|running/,
    );
  });

  test('offers the menu of a detached HEAD commit', () => {
    const hash = 'c'.repeat(40);
    const targets: MenuTarget[] = [];
    let bubble: React.ReactElement<{ onContextMenu: () => void }> | undefined;
    const Capture = () => (bubble = HeadBubble({ hash }));
    renderToStaticMarkup(
      <OpenContextMenu.Provider value={(_, target) => targets.push(target)}>
        <Capture />
      </OpenContextMenu.Provider>,
    );
    assert.match(
      renderToStaticMarkup(bubble),
      new RegExp(`title="HEAD is detached at ${hash}">HEAD ccccccc<`),
    );
    bubble?.props.onContextMenu();
    assert.deepStrictEqual(targets, [
      { kind: 'ref', ref: { kind: 'commit', name: hash } },
    ]);
  });
});
