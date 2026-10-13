import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import {
  BranchActions,
  type BranchActionsOf,
  BubbleActions,
  HideDimmedButtons,
  OtherBranchActions,
  OtherBranchButtons,
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

function tagged(
  name: string,
  onRemote: string[],
  remote: string | undefined,
  hideDimmed = false,
): string {
  return renderToStaticMarkup(
    <HideDimmedButtons.Provider value={hideDimmed}>
      <TagActions.Provider
        value={{
          remote,
          onRemote: new Set(onRemote),
          pushing: [],
          onPush: noop,
        }}
      >
        <RefBubble info={{ kind: 'tag', name }} actions />
      </TagActions.Provider>
    </HideDimmedButtons.Provider>,
  );
}

function otherBranch(
  name: string,
  tracking: BranchActionsOf['tracking'],
  {
    hideDimmed = false,
    elsewhere = [] as string[],
    pulling = [] as readonly string[],
  } = {},
): string {
  return renderToStaticMarkup(
    <HideDimmedButtons.Provider value={hideDimmed}>
      <OtherBranchActions.Provider
        value={{
          pulling,
          pushing: [],
          onPull: noop,
          onPush: noop,
          elsewhere: new Set(elsewhere),
        }}
      >
        <CheckedOutBranch.Provider value="main">
          <RefBubble
            info={{ kind: 'branch', name }}
            tracking={tracking}
            actions
          />
        </CheckedOutBranch.Provider>
      </OtherBranchActions.Provider>
    </HideDimmedButtons.Provider>,
  );
}

function idleIn(markup: string, title: string): boolean {
  return classesOf(tagWith(markup, `title="${title}`, 'bubble-action')).has(
    'idle',
  );
}

function checkedOut(
  tracking: BranchActionsOf['tracking'],
  hideDimmed: boolean,
): string {
  return renderToStaticMarkup(
    <HideDimmedButtons.Provider value={hideDimmed}>
      <BranchActions.Provider value={{ ...idle, tracking }}>
        <CheckedOutBranch.Provider value="main">
          <RefBubble info={{ kind: 'branch', name: 'main' }} actions />
        </CheckedOutBranch.Provider>
      </BranchActions.Provider>
    </HideDimmedButtons.Provider>,
  );
}

function actionsWith(tracking: BranchActionsOf['tracking']): string {
  return renderToStaticMarkup(<BubbleActions {...idle} tracking={tracking} />);
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

  test('counts on the bubble the commits there are to pull and to push since the last fetch, dimming an arrow with nothing to do, both when the branch has diverged, though they stay clickable as a fetch may find more', () => {
    const behind = actionsWith({
      upstream: 'origin/main',
      ahead: 0,
      behind: 2,
    });
    assert.match(
      behind,
      /title="Pull:[^"]*"[^>]*><svg.*?<\/svg><span class="bubble-count">2<\/span><\/button>/,
    );
    assert.ok(
      !classesOf(tagWith(behind, 'title="Pull:', 'bubble-action')).has('idle'),
    );
    tagWith(behind, 'title="Push:', 'bubble-action', 'idle');
    const ahead = actionsWith({ upstream: 'origin/main', ahead: 1, behind: 0 });
    assert.match(
      ahead,
      /title="Push:[^"]*"[^>]*><svg.*?<\/svg><span class="bubble-count">1<\/span><\/button>/,
    );
    assert.ok(
      !classesOf(tagWith(ahead, 'title="Push:', 'bubble-action')).has('idle'),
    );
    tagWith(ahead, 'title="Pull:', 'bubble-action', 'idle');
    const diverged = actionsWith({
      upstream: 'origin/main',
      ahead: 1,
      behind: 2,
    });
    for (const [title, count] of [
      ['Pull:', 2],
      ['Push:', 1],
    ] as const) {
      assert.match(
        diverged,
        new RegExp(
          `title="${title}[^"]*"[^>]*><svg.*?</svg><span class="bubble-count">${count}</span></button>`,
        ),
      );
      assert.doesNotMatch(
        tagWith(diverged, `title="${title}`, 'bubble-action', 'idle'),
        /disabled/,
      );
    }
    for (const quiet of [
      { upstream: 'origin/main', ahead: 0, behind: 0 },
      { upstream: 'origin/main', gone: true as const },
    ]) {
      const markup = actionsWith(quiet);
      for (const title of ['Pull:', 'Push:']) {
        const button = tagWith(
          markup,
          `title="${title}`,
          'bubble-action',
          'idle',
        );
        assert.doesNotMatch(button, /disabled/);
      }
      assert.doesNotMatch(markup, /bubble-count/);
    }
    const unpublished = actionsWith(undefined);
    tagWith(unpublished, 'title="Pull:', 'bubble-action', 'idle');
    assert.ok(
      !classesOf(tagWith(unpublished, 'title="Push:', 'bubble-action')).has(
        'idle',
      ),
    );
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

  test('puts a push button on every local tag, as a tag can only be pushed, bright where the remote it would go to lacks it and dimmed where it has it or that remote is unknown, but on no remote tag', () => {
    const missing = tagged('v1', ['v0'], 'origin');
    tagWith(missing, '', 'badge', 'tag', 'with-actions');
    const bright = tagWith(
      missing,
      'title="Push v1 to origin"',
      'bubble-action',
      'push',
    );
    assert.ok(!classesOf(bright).has('idle'));
    tagWith(
      tagged('v1', ['v1'], 'origin'),
      'title="Push v1 to origin"',
      'bubble-action',
      'idle',
    );
    tagWith(
      tagged('v1', [], undefined),
      'title="Push v1"',
      'bubble-action',
      'idle',
    );
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
            pushing: [],
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

  test('puts down and up arrows on every local branch that is not checked out, with its counts, bright by its state like the blue bubble', () => {
    const behind = otherBranch('side', {
      upstream: 'origin/side',
      ahead: 0,
      behind: 2,
    });
    tagWith(behind, '', 'badge', 'branch', 'with-actions');
    assert.ok(
      !classesOf(tagWith(behind, '', 'badge', 'branch')).has('checked-out'),
    );
    assert.match(
      behind,
      /title="Pull:[^"]*"[^>]*><svg.*?<\/svg><span class="bubble-count">2<\/span>/,
    );
    assert.ok(!idleIn(behind, 'Pull:'));
    assert.ok(idleIn(behind, 'Push:'));
    const ahead = otherBranch('side', {
      upstream: 'origin/side',
      ahead: 1,
      behind: 0,
    });
    assert.ok(idleIn(ahead, 'Pull:') && !idleIn(ahead, 'Push:'));
    for (const quiet of [
      otherBranch('side', { upstream: 'origin/side', ahead: 1, behind: 2 }),
      otherBranch('side', { upstream: 'origin/side', gone: true }),
      otherBranch('side', { upstream: 'origin/side', ahead: 0, behind: 0 }),
    ]) {
      assert.ok(idleIn(quiet, 'Pull:') && idleIn(quiet, 'Push:'));
    }
    const unpublished = otherBranch('side', undefined);
    assert.ok(idleIn(unpublished, 'Pull:') && !idleIn(unpublished, 'Push:'));
    const elsewhere = otherBranch(
      'side',
      { upstream: 'origin/side', ahead: 0, behind: 2 },
      { elsewhere: ['side'] },
    );
    assert.ok(idleIn(elsewhere, 'Pull:'));
    assert.doesNotMatch(
      otherBranch(
        'side',
        { upstream: 'origin/side', ahead: 0, behind: 0 },
        { hideDimmed: true },
      ),
      /bubble-action|with-actions/,
    );
    assert.doesNotMatch(
      renderToStaticMarkup(
        <OtherBranchActions.Provider
          value={{
            pulling: [],
            pushing: [],
            onPull: noop,
            onPush: noop,
            elsewhere: new Set(),
          }}
        >
          <RefBubble info={{ kind: 'remote', name: 'origin/side' }} actions />
          <RefBubble info={{ kind: 'branch', name: 'side' }} />
        </OtherBranchActions.Provider>,
      ),
      /bubble-action/,
    );
  });

  test('pulls and pushes the branch of its bubble, marking only the arrow of that branch as running', () => {
    const pulled: string[] = [];
    const action = renderedBy(OtherBranchButtons, {
      name: 'side',
      tracking: { upstream: 'origin/side', ahead: 0, behind: 2 },
      actions: {
        pulling: [],
        pushing: [],
        onPull: (name) => pulled.push(`pull ${name}`),
        onPush: (name) => pulled.push(`push ${name}`),
        elsewhere: new Set<string>(),
      },
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(action));
    for (const button of action.props.children) {
      assert.ok(
        isValidElement<{
          onClick: (event: { stopPropagation: () => void }) => void;
        }>(button),
      );
      button.props.onClick({ stopPropagation: noop });
    }
    assert.deepStrictEqual(pulled, ['pull side', 'push side']);
    const busy = otherBranch(
      'side',
      { upstream: 'origin/side', ahead: 0, behind: 2 },
      { pulling: ['other', 'side'] },
    );
    assert.match(
      tagWith(busy, 'title="Pull:', 'bubble-action', 'running'),
      /disabled=""/,
    );
    const calm = otherBranch(
      'other',
      { upstream: 'origin/other', ahead: 0, behind: 2 },
      { pulling: ['side'] },
    );
    assert.doesNotMatch(
      tagWith(calm, 'title="Pull:', 'bubble-action'),
      /running|disabled/,
    );
  });

  test('hides the dimmed buttons when asked, leaving a bubble without any its plain look', () => {
    tagWith(
      tagged('v1', [], 'origin', true),
      'title="Push v1 to origin"',
      'bubble-action',
    );
    for (const markup of [
      tagged('v1', ['v1'], 'origin', true),
      tagged('v1', [], undefined, true),
      checkedOut({ upstream: 'origin/main', ahead: 0, behind: 0 }, true),
    ]) {
      assert.doesNotMatch(markup, /bubble-action|with-actions/);
    }
    const behind = checkedOut(
      { upstream: 'origin/main', ahead: 0, behind: 2 },
      true,
    );
    tagWith(behind, 'title="Pull:', 'bubble-action', 'pull');
    assert.doesNotMatch(behind, /title="Push:/);
    const shown = checkedOut(
      { upstream: 'origin/main', ahead: 0, behind: 0 },
      false,
    );
    tagWith(shown, 'title="Pull:', 'bubble-action', 'idle');
    tagWith(shown, 'title="Push:', 'bubble-action', 'idle');
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
          pushing: ['v0', 'v1'],
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
