import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup as markupOf } from 'react-dom/server';
import { suite, test } from 'vitest';
import {
  BubbleReplica,
  TagPushAction,
  CommitBubble,
  HeadBubble,
  RefBubble,
  StashBubble,
} from '../../../../../tools/git/page/bubbles';
import { lookOf } from '../../../../../tools/git/page/bubbleLooks';
import type { MenuEvent } from '../../../../../tools/git/page/menus';
import { GitStore } from '../../../../../tools/git/page/store';
import { createShellStore, ShellStore } from '../../../../../shell/page/store';
import { strings } from '../../../../../lib/shared/strings';
import type {
  BookmarkRef,
  GitToHost,
  RefInfo,
  Tracking,
} from '../../../../../tools/git/shared/protocol';
import {
  gitStore,
  type ShownGit,
  renderedBy,
} from '../../../../helpers/componentFixtures';
import { noop } from '../../../../helpers/fixtures';
import { withStores } from '../../../../helpers/componentFixtures';
import { classesOf, tagWith } from '../../../../helpers/markup';
const renderToStaticMarkup = (node: React.ReactNode) =>
  markupOf(withStores(node));

function shownIn(shown: ShownGit, node: React.ReactNode): string {
  return renderToStaticMarkup(
    <GitStore value={gitStore(shown)}>{node}</GitStore>,
  );
}

function onMain(node: React.ReactNode): string {
  return shownIn({ head: 'main' }, node);
}

function tagged(
  name: string,
  onRemote: string[],
  remote: string | undefined,
): string {
  return shownIn(
    {
      ...(remote === undefined ? {} : { tagRemote: remote }),
      refs: onRemote.map((tag) => ({
        kind: 'remote-tag',
        name: `${remote}/${tag}`,
        commit: 'a'.repeat(40),
        ...(remote === undefined ? {} : { remote }),
      })),
    },
    <RefBubble info={{ kind: 'tag', name }} actions />,
  );
}

function otherBranch(
  name: string,
  tracking: Tracking | undefined,
  { elsewhere = [] as string[], pulling = [] as readonly string[] } = {},
): string {
  return shownIn(
    { head: 'main', elsewhere, tab: { pullingBranch: pulling } },
    <RefBubble info={{ kind: 'branch', name }} tracking={tracking} actions />,
  );
}

type Clickable = React.ReactElement<{
  children?: React.ReactNode;
  onClick?: (event: { stopPropagation: () => void }) => void;
}>;

function buttonsIn(node: React.ReactNode): Clickable[] {
  if (Array.isArray(node)) {
    return node.flatMap(buttonsIn);
  }
  if (
    isValidElement<Parameters<typeof TagPushAction>[0]>(node) &&
    node.type === TagPushAction
  ) {
    return buttonsIn(TagPushAction(node.props));
  }
  if (!isValidElement<Clickable['props']>(node)) {
    return [];
  }
  return node.type === 'button' ? [node] : buttonsIn(node.props.children);
}

const behindItsUpstream: Tracking = {
  upstream: 'origin/x',
  ahead: 0,
  behind: 1,
};

function clicksOn(info: BookmarkRef, tracking?: Tracking): GitToHost[] {
  const posted: GitToHost[] = [];
  let buttons: Clickable[] = [];
  function Probe() {
    buttons = buttonsIn(
      RefBubble({ info, actions: true, ...(tracking && { tracking }) }),
    );
    return null;
  }
  renderToStaticMarkup(
    <GitStore
      value={gitStore(
        { head: 'main', tagRemote: 'origin', tab: { root: '/repo' } },
        (message) => posted.push(message),
      )}
    >
      <Probe />
    </GitStore>,
  );
  for (const button of buttons) {
    button.props.onClick?.({ stopPropagation: noop });
  }
  return posted;
}

function actionsWith(tracking: Tracking | undefined): string {
  return shownIn(
    { head: 'main' },
    <RefBubble
      info={{ kind: 'branch', name: 'main' }}
      tracking={tracking}
      actions
    />,
  );
}

function actionButtonsOf(bubble: React.ReactNode): React.ReactElement<{
  onClick: (event: { stopPropagation: () => void }) => void;
  onMouseDown: (event: { preventDefault: () => void }) => void;
}>[] {
  assert.ok(isValidElement<{ children: React.ReactNode[] }>(bubble));
  const actions = bubble.props.children[1];
  assert.ok(isValidElement<{ children: React.ReactElement[] }>(actions));
  return actions.props.children.map((button) => {
    assert.ok(
      isValidElement<{
        onClick: (event: { stopPropagation: () => void }) => void;
        onMouseDown: (event: { preventDefault: () => void }) => void;
      }>(button),
    );
    return button;
  });
}

function postedTypes(posted: readonly GitToHost[]): string[] {
  return posted.map((message) =>
    'name' in message ? `${message.type} ${message.name}` : message.type,
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
    const html = onMain(
      <>
        <RefBubble info={{ kind: 'branch', name: 'main' }} />
        <RefBubble info={{ kind: 'tag', name: 'main' }} />
        <RefBubble info={{ kind: 'branch', name: 'gone' }} missing />
        <CommitBubble hash={'b'.repeat(40)} />
      </>,
    );
    assert.match(
      tagWith(html, '', 'badge', 'branch', 'checked-out'),
      /data-tip="main, checked out"/,
    );
    assert.ok(!classesOf(tagWith(html, '', 'badge', 'tag')).has('checked-out'));
    tagWith(
      html,
      'data-tip="gone doesn&#x27;t exist anymore"',
      'badge',
      'missing',
    );
    assert.match(
      html,
      new RegExp(`data-tip="Commit ${'b'.repeat(40)}">bbbbbbb</span>`),
    );
  });

  test('puts pull on the bubble of the checked-out branch while there is something to pull, and push while there is something to push or no upstream, where asked, and neither on a bubble of a remote branch', () => {
    const behind = actionsWith({
      upstream: 'origin/main',
      ahead: 0,
      behind: 2,
    });
    const bubble = tagWith(behind, '', 'badge', 'checked-out', 'with-actions');
    assert.match(bubble, /data-tip="main, checked out"/);
    assert.match(
      behind,
      /^<span[^>]*><span class="bubble-name">main<\/span><span class="bubble-actions"><button class="bubble-action[^"]*" aria-label="Pull:[^"]*" data-tip="Pull:[^"]*" tabindex="-1">.*?<\/button><\/span><\/span>$/,
    );
    assert.match(
      actionsWith(undefined),
      /^<span[^>]*><span class="bubble-name">main<\/span><span class="bubble-actions"><button class="bubble-action[^"]*" aria-label="Push:[^"]*" data-tip="Push:[^"]*" tabindex="-1">.*?<\/button><\/span><\/span>$/,
    );
    for (const without of [
      <RefBubble key="a" info={{ kind: 'branch', name: 'main' }} />,
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
    tagWith(
      actionsWith({ upstream: 'origin/main', ahead: 0, behind: 2 }),
      'data-tip="Pull: fetch every remote, then fast-forward to the upstream"',
      'bubble-action',
    );
    tagWith(
      actionsWith(undefined),
      'data-tip="Push: send the new commits to the upstream, or publish to the only remote when there is none"',
      'bubble-action',
    );
  });

  test('pulls and pushes from the bubble without selecting its row or taking the keys from the list', () => {
    const calls: string[] = [];
    const posted: GitToHost[] = [];
    const store = gitStore(
      { head: 'main', tab: { root: '/repo' } },
      (message) => posted.push(message),
    );
    for (const props of [
      {
        info: { kind: 'branch', name: 'main' },
        tracking: { upstream: 'origin/main', ahead: 0, behind: 2 },
        actions: true,
      },
      { info: { kind: 'branch', name: 'main' }, actions: true },
    ] as const) {
      const bubble = renderedBy(RefBubble, props, { git: store });
      for (const button of actionButtonsOf(bubble)) {
        button.props.onMouseDown({
          preventDefault: () => calls.push('kept focus'),
        });
        button.props.onClick({
          stopPropagation: () => calls.push('row left alone'),
        });
        calls.push(...postedTypes(posted.splice(0)));
      }
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

  test('counts on the bubble the commits there are to pull and to push since the last fetch, leaving out an arrow with nothing to do, both when the branch has diverged, and the bubble its plain look without any', () => {
    const behind = actionsWith({
      upstream: 'origin/main',
      ahead: 0,
      behind: 2,
    });
    assert.match(
      behind,
      /data-tip="Pull:[^"]*"[^>]*><svg.*?<\/svg><span class="bubble-count">2<\/span><\/button>/,
    );
    assert.doesNotMatch(behind, /data-tip="Push:/);
    const ahead = actionsWith({ upstream: 'origin/main', ahead: 1, behind: 0 });
    assert.match(
      ahead,
      /data-tip="Push:[^"]*"[^>]*><svg.*?<\/svg><span class="bubble-count">1<\/span><\/button>/,
    );
    assert.doesNotMatch(ahead, /data-tip="Pull:/);
    for (const quiet of [
      { upstream: 'origin/main', ahead: 1, behind: 2 },
      { upstream: 'origin/main', ahead: 0, behind: 0 },
      { upstream: 'origin/main', gone: true as const },
    ]) {
      assert.doesNotMatch(actionsWith(quiet), /bubble-action|with-actions/);
    }
    const unpublished = actionsWith(undefined);
    assert.doesNotMatch(unpublished, /data-tip="Pull:|bubble-count/);
    tagWith(unpublished, 'data-tip="Push:', 'bubble-action');
  });

  test('disables pull and push on the bubble while each runs, marking it as running, and leaves the other alone', () => {
    const behind = { upstream: 'origin/main', ahead: 0, behind: 2 };
    const ahead = { upstream: 'origin/main', ahead: 1, behind: 0 };
    for (const [running, title, tracking] of [
      [{ pulling: true }, 'Pull:', behind],
      [{ pushing: true }, 'Push:', ahead],
    ] as const) {
      const html = shownIn(
        { head: 'main', tab: running },
        <RefBubble
          info={{ kind: 'branch', name: 'main' }}
          tracking={tracking}
          actions
        />,
      );
      const busy = tagWith(
        html,
        `data-tip="${title}`,
        'bubble-action',
        'running',
      );
      assert.match(busy, /disabled=""/);
    }
    const other = tagWith(
      shownIn(
        { head: 'main', tab: { pushing: true } },
        <RefBubble
          info={{ kind: 'branch', name: 'main' }}
          tracking={behind}
          actions
        />,
      ),
      'data-tip="Pull:',
      'bubble-action',
    );
    assert.ok(!classesOf(other).has('running'));
    assert.doesNotMatch(other, /disabled/);
  });

  test('puts a push button on every local tag the remote it would go to lacks, as a tag can only be pushed, but none where that remote has it or is unknown, and none on a remote tag', () => {
    const missing = tagged('v1', ['v0'], 'origin');
    tagWith(missing, '', 'badge', 'tag', 'with-actions');
    tagWith(missing, 'data-tip="Push v1 to origin"', 'bubble-action', 'push');
    for (const markup of [
      tagged('v1', ['v1'], 'origin'),
      tagged('v1', [], undefined),
    ]) {
      assert.doesNotMatch(markup, /bubble-action|with-actions/);
    }
    assert.doesNotMatch(
      shownIn(
        { tagRemote: 'origin' },
        <>
          <RefBubble info={{ kind: 'tag', name: 'v1' }} />
          <RefBubble info={{ kind: 'remote-tag', name: 'origin/v1' }} actions />
        </>,
      ),
      /bubble-action/,
    );
  });

  test('puts down and up arrows on a local branch that is not checked out while there is something to pull or push, with its counts, and none where there is nothing to do', () => {
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
      /data-tip="Pull:[^"]*"[^>]*><svg.*?<\/svg><span class="bubble-count">2<\/span>/,
    );
    assert.doesNotMatch(behind, /data-tip="Push:/);
    const ahead = otherBranch('side', {
      upstream: 'origin/side',
      ahead: 1,
      behind: 0,
    });
    tagWith(ahead, 'data-tip="Push:', 'bubble-action');
    assert.doesNotMatch(ahead, /data-tip="Pull:/);
    for (const quiet of [
      otherBranch('side', { upstream: 'origin/side', ahead: 1, behind: 2 }),
      otherBranch('side', { upstream: 'origin/side', gone: true }),
      otherBranch('side', { upstream: 'origin/side', ahead: 0, behind: 0 }),
      otherBranch(
        'side',
        { upstream: 'origin/side', ahead: 0, behind: 2 },
        { elsewhere: ['side'] },
      ),
    ]) {
      assert.doesNotMatch(quiet, /bubble-action|with-actions/);
    }
    const unpublished = otherBranch('side', undefined);
    tagWith(unpublished, 'data-tip="Push:', 'bubble-action');
    assert.doesNotMatch(unpublished, /data-tip="Pull:/);
    assert.doesNotMatch(
      onMain(
        <>
          <RefBubble info={{ kind: 'remote', name: 'origin/side' }} actions />
          <RefBubble info={{ kind: 'branch', name: 'side' }} />
        </>,
      ),
      /bubble-action/,
    );
  });

  test('pulls and pushes the branch of its bubble, marking only the arrow of that branch as running', () => {
    const posted: GitToHost[] = [];
    const store = gitStore(
      { head: 'main', tab: { root: '/repo' } },
      (message) => posted.push(message),
    );
    for (const props of [
      {
        info: { kind: 'branch', name: 'side' },
        tracking: { upstream: 'origin/side', ahead: 0, behind: 2 },
        actions: true,
      },
      { info: { kind: 'branch', name: 'side' }, actions: true },
    ] as const) {
      for (const button of actionButtonsOf(
        renderedBy(RefBubble, props, { git: store }),
      )) {
        button.props.onClick({ stopPropagation: noop });
      }
    }
    assert.deepStrictEqual(postedTypes(posted), [
      'pullBranch side',
      'pushBranch side',
    ]);
    const busy = otherBranch(
      'side',
      { upstream: 'origin/side', ahead: 0, behind: 2 },
      { pulling: ['other', 'side'] },
    );
    assert.match(
      tagWith(busy, 'data-tip="Pull:', 'bubble-action', 'running'),
      /disabled=""/,
    );
    const calm = otherBranch(
      'other',
      { upstream: 'origin/other', ahead: 0, behind: 2 },
      { pulling: ['side'] },
    );
    assert.doesNotMatch(
      tagWith(calm, 'data-tip="Pull:', 'bubble-action'),
      /running|disabled/,
    );
  });

  test('pushes the tag of its bubble without selecting its row or taking the keys from the list, marking only that tag as running while it pushes', () => {
    const calls: string[] = [];
    const action = renderedBy(
      TagPushAction,
      { tag: 'v1' },
      {
        git: gitStore(
          { tagRemote: 'origin', tab: { root: '/repo' } },
          (message) => {
            if (message.type === 'pushTag') {
              calls.push(`push ${message.name}`);
            }
          },
        ),
      },
    );
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
    const html = shownIn(
      { tagRemote: 'origin', tab: { pushingTag: ['v0', 'v1'] } },
      <>
        <RefBubble info={{ kind: 'tag', name: 'v1' }} actions />
        <RefBubble info={{ kind: 'tag', name: 'v2' }} actions />
      </>,
    );
    assert.match(
      tagWith(html, 'data-tip="Push v1 to origin"', 'bubble-action', 'running'),
      /disabled=""/,
    );
    assert.doesNotMatch(
      tagWith(html, 'data-tip="Push v2 to origin"', 'bubble-action'),
      /disabled|running/,
    );
  });

  test('pulls and pushes the checked-out branch, another branch and a tag from their bubbles for the worktree shown', () => {
    for (const name of ['main', 'side']) {
      assert.deepStrictEqual(
        [
          ...clicksOn({ kind: 'branch', name }, behindItsUpstream),
          ...clicksOn({ kind: 'branch', name }),
        ],
        name === 'main'
          ? [
              { type: 'pull', root: '/repo' },
              { type: 'push', root: '/repo' },
            ]
          : [
              { type: 'pullBranch', name: 'side', root: '/repo' },
              { type: 'pushBranch', name: 'side', root: '/repo' },
            ],
      );
    }
    assert.deepStrictEqual(clicksOn({ kind: 'tag', name: 'v1' }), [
      { type: 'pushTag', name: 'v1', root: '/repo' },
    ]);
  });

  test('offers the menu of a detached HEAD commit where it was clicked, to check it out or bookmark it', () => {
    const hash = 'c'.repeat(40);
    const shell = createShellStore(noop);
    let bubble:
      | React.ReactElement<{ onContextMenu: (event: MenuEvent) => void }>
      | undefined;
    const Capture = () => (bubble = HeadBubble({ hash }));
    renderToStaticMarkup(
      <ShellStore value={shell}>
        <GitStore value={gitStore()}>
          <Capture />
        </GitStore>
      </ShellStore>,
    );
    assert.match(
      renderToStaticMarkup(bubble),
      new RegExp(`data-tip="HEAD is detached at ${hash}">HEAD ccccccc<`),
    );
    const kept: string[] = [];
    bubble?.props.onContextMenu({
      clientX: 3,
      clientY: 4,
      stopPropagation: () => kept.push('row'),
      preventDefault: () => kept.push('browser menu'),
    });
    assert.deepStrictEqual(kept, ['row', 'browser menu']);
    const shown = shell.getState().menu?.menu;
    assert.deepStrictEqual([shown?.x, shown?.y], [3, 4]);
    assert.deepStrictEqual(
      shown?.items.map((item) => ('separator' in item ? '-' : item.label)),
      [strings.commits.checkout, '-', strings.commits.addBookmark],
    );
  });
});

function layoutOf(markup: string): string {
  return markup
    .replaceAll(/\s(?!class=)[\w:-]+="[^"]*"/g, '')
    .replaceAll(/class="([^"]*)"/g, (_, names: string) => {
      const kept = names
        .split(/\s+/)
        .filter(
          (name) =>
            name !== '' &&
            !['checked-out', 'missing', 'running'].includes(name),
        );
      return `class="${kept.join(' ')}"`;
    });
}

const tracked = (ahead: number, behind: number): Tracking => ({
  upstream: 'origin/x',
  ahead,
  behind,
});

suite('Bubble copies', () => {
  const cases: {
    name: string;
    ref: RefInfo;
    shown: ShownGit;
  }[] = [
    {
      name: 'the checked-out branch, behind',
      ref: {
        kind: 'branch',
        name: 'main',
        commit: 'a',
        tracking: tracked(0, 13),
      },
      shown: { head: 'main' },
    },
    {
      name: 'the checked-out branch, ahead',
      ref: {
        kind: 'branch',
        name: 'main',
        commit: 'a',
        tracking: tracked(2, 0),
      },
      shown: { head: 'main' },
    },
    {
      name: 'another branch checked out elsewhere',
      ref: {
        kind: 'branch',
        name: 'other',
        commit: 'a',
        tracking: tracked(0, 1),
      },
      shown: { head: 'main', elsewhere: ['other'] },
    },
    {
      name: 'a branch level with its upstream',
      ref: {
        kind: 'branch',
        name: 'level',
        commit: 'a',
        tracking: tracked(0, 0),
      },
      shown: { head: 'main' },
    },
    {
      name: 'a tag the remote lacks',
      ref: { kind: 'tag', name: 'v1.2', commit: 'a' },
      shown: { tagRemote: 'origin' },
    },
    {
      name: 'a tag with no remote',
      ref: { kind: 'tag', name: 'v1.3', commit: 'a' },
      shown: {},
    },
    {
      name: 'a remote branch',
      ref: {
        kind: 'remote',
        name: 'origin/main',
        commit: 'a',
        remote: 'origin',
      },
      shown: { head: 'main' },
    },
  ];
  for (const { name, ref, shown } of cases) {
    test(`draws the hidden copy the commit list measures of ${name} as the bubble itself, its actions and counts alike, so the widths measured are those of the bubbles drawn`, () => {
      const look = lookOf({ type: 'ref', ref }, 'a', {
        head: shown.head,
        elsewhere: new Set(shown.elsewhere),
        tagRemote: shown.tagRemote,
        tagsOnRemote: new Set(),
      });
      assert.strictEqual(
        layoutOf(renderToStaticMarkup(<BubbleReplica look={look} />)),
        layoutOf(
          shownIn(
            { ...shown, refs: [ref] },
            <RefBubble info={ref} tracking={ref.tracking} actions />,
          ),
        ),
      );
    });
  }

  test('draws the hidden copies of the other bubbles as the bubbles themselves', () => {
    const hash = 'a'.repeat(40);
    const around = {
      head: undefined,
      elsewhere: new Set<string>(),
      tagRemote: undefined,
      tagsOnRemote: new Set<string>(),
    };
    for (const [bubble, drawn] of [
      [{ type: 'head' }, <HeadBubble key="head" hash={hash} />],
      [{ type: 'bookmark' }, <CommitBubble key="bookmark" hash={hash} />],
      [{ type: 'stash' }, <StashBubble key="stash" />],
    ] as const) {
      assert.strictEqual(
        layoutOf(
          renderToStaticMarkup(
            <BubbleReplica look={lookOf(bubble, hash, around)} />,
          ),
        ),
        layoutOf(shownIn({}, drawn)),
      );
    }
  });
});
