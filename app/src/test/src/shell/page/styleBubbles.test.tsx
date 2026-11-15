import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { RefBubble } from '../../../../tools/git/page/bubbles';
import { GitStore } from '../../../../tools/git/page/store';
import { cascaded } from '../../../helpers/cascade';
import { gitStore } from '../../../helpers/componentFixtures';
import { BubbleSources, CommitRowShown } from '../../../helpers/styleFixtures';
import { bubbles, repository } from '../../../helpers/styleMarkup';
import {
  looks,
  looksAlike,
  sidesOf,
  hovered,
  unwrapped,
} from './stylesheetFixtures';
import {
  allWithClass,
  rendered,
  withClass,
  type MarkupElement,
} from '../../../helpers/markup';

const bubbleLook = ['color', 'background', 'box-shadow', 'border'];

function branchBubble(sources: React.ReactElement): MarkupElement {
  const branch = bubbles(sources).find(
    (bubble) =>
      bubble.classes.includes('branch') &&
      !bubble.classes.includes('checked-out'),
  );
  assert.ok(branch);
  return branch;
}

function tagHoleReach(tag: MarkupElement): number {
  const hole =
    /^radial-gradient\(circle at calc\(100% - ([\d.]+)px\) 50%, transparent [\d.]+px, var\(--color-git-bubble\) ([\d.]+)px\)$/.exec(
      unwrapped(cascaded(tag, 'background')),
    );
  assert.ok(hole);
  return Number(hole[1]) + Number(hole[2]);
}

suite('Style', () => {
  test('draws every bubble but the checked-out one and tags alike, in the bubble colors, ringed inside in the bubble border color to stand apart from a selected row', () => {
    const all = bubbles(<BubbleSources />).filter(
      (bubble) =>
        !bubble.classes.includes('checked-out') &&
        !bubble.classes.includes('tag') &&
        !bubble.classes.includes('remote-tag'),
    );
    for (const kind of ['branch', 'remote', 'stash', 'hash', 'missing']) {
      assert.ok(
        all.some((bubble) => bubble.classes.includes(kind)),
        kind,
      );
    }
    for (const bubble of all) {
      looks(bubble, {
        color: 'var(--color-git-bubble-foreground)',
        background: 'var(--color-git-bubble)',
        'box-shadow':
          'inset 0 0 0 var(--hairline) var(--color-git-bubble-border)',
        border: undefined,
      });
    }
  });

  test('shapes a tag like a tag icon, pointed at the right end with the corners of the point rounded by about a pixel and a round hole by the point that shows the row through it, leaving room for both after the name, so it stands apart from the branches, which move on as tags never do', () => {
    const tags = bubbles(<BubbleSources />).filter(
      (bubble) =>
        bubble.classes.includes('tag') || bubble.classes.includes('remote-tag'),
    );
    for (const kind of ['tag', 'remote-tag']) {
      assert.ok(
        tags.some((tag) => tag.classes.includes(kind)),
        kind,
      );
    }
    for (const tag of tags) {
      assert.strictEqual(
        unwrapped(cascaded(tag, 'background')),
        'radial-gradient(circle at calc(100% - 9px) 50%, transparent 2px, var(--color-git-bubble) 2.5px)',
      );
      assert.strictEqual(
        unwrapped(cascaded(tag, 'clip-path')),
        'shape(from 0 0, hline to calc(100% - 8px), curve to calc(100% - 6.4px) 0.8px with calc(100% - 7px) 0, line to calc(100% - 0.8px) calc(50% - 1px), curve to calc(100% - 0.8px) calc(50% + 1px) with 100% 50%, line to calc(100% - 6.4px) calc(100% - 0.8px), curve to calc(100% - 8px) 100% with calc(100% - 7px) 100%, hline to 0, close)',
      );
      looks(tag, {
        color: 'var(--color-git-bubble-foreground)',
        'box-shadow': cascaded(branchBubble(<BubbleSources />), 'box-shadow'),
        border: undefined,
      });
      assert.ok(
        parseFloat(cascaded(tag, 'padding-right') ?? '') >= tagHoleReach(tag),
      );
    }
  });

  test("keeps a tag's hole and point clear of the push button on it, which squares off, as the tag goes on past it", () => {
    const tag = withClass(
      rendered(
        <GitStore value={gitStore({ tagRemote: 'origin' })}>
          <div className="bubble-line">
            <RefBubble info={{ kind: 'tag', name: 'v1' }} actions />
          </div>
        </GitStore>,
      ),
      'badge',
    );
    assert.ok(
      parseFloat(cascaded(tag, 'padding-right') ?? '') >= tagHoleReach(tag),
    );
    looks(withClass(tag, 'bubble-action'), { 'border-radius': '0' });
  });

  test('keeps a bubble with buttons within its line, cutting off its long name with an ellipsis and never its buttons', () => {
    const line = rendered(
      <GitStore
        value={gitStore({ head: 'docs/a-branch-name-longer-than-its-line' })}
      >
        <div className="bubble-line">
          <RefBubble
            info={{
              kind: 'branch',
              name: 'docs/a-branch-name-longer-than-its-line',
            }}
            actions
          />
        </div>
      </GitStore>,
    );
    looks(withClass(line, 'badge', 'with-actions'), {
      'max-width': 'calc(100% + var(--bubble-inset))',
    });
    looks(withClass(line, 'bubble-name'), {
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'min-width': '0',
    });
    looks(withClass(line, 'bubble-actions'), { flex: 'none' });
  });

  test('dims an arrow of the blue bubble with nothing to do, and counts in figures of one width, so the bubble keeps its size as the counts change', () => {
    const actions = rendered(
      <GitStore value={gitStore({ head: 'main' })}>
        <RefBubble
          info={{ kind: 'branch', name: 'main' }}
          tracking={{ upstream: 'origin/main', ahead: 0, behind: 12 }}
          actions
        />
      </GitStore>,
    );
    looks(withClass(actions, 'bubble-action', 'idle'), {
      opacity: 'var(--muted-opacity)',
    });
    looks(withClass(actions, 'bubble-count'), {
      'font-variant-numeric': 'tabular-nums',
    });
  });

  test('fills the checked-out bubble with its own colors, ringing it like the others in its own border color, and no bubble changes under the pointer', () => {
    const all = bubbles(<BubbleSources checkedOut="main" />);
    const checkedOut = all.filter((bubble) =>
      bubble.classes.includes('checked-out'),
    );
    for (const kind of ['head', 'branch']) {
      assert.ok(
        checkedOut.some((bubble) => bubble.classes.includes(kind)),
        kind,
      );
    }
    const ring = cascaded(
      branchBubble(<BubbleSources />),
      'box-shadow',
    )?.replace(
      'var(--color-git-bubble-border)',
      'var(--color-git-bubble-checked-out-border)',
    );
    for (const bubble of checkedOut) {
      looks(bubble, {
        color: 'var(--color-git-bubble-checked-out-foreground)',
        background: 'var(--color-git-bubble-checked-out)',
        'box-shadow': ring,
        border: undefined,
      });
    }
    assert.ok(all.some((bubble) => bubble.parent?.classes.includes('active')));
    for (const bubble of all) {
      looksAlike(bubble, bubbleLook, hovered);
    }
  });

  test('draws bubbles in the flow of their line, starting where the other lines start, each kept within the line, cutting off its long name with an ellipsis', () => {
    const commit = rendered(
      <CommitRowShown
        hideDimmed
        refs={repository.refs.map((ref) =>
          ref.kind === 'branch'
            ? {
                ...ref,
                tracking: { upstream: 'origin/main', ahead: 0, behind: 0 },
              }
            : ref,
        )}
      />,
    );
    const line = cascaded(withClass(commit, 'bubble-line'), 'line-height');
    for (const badge of allWithClass(commit, 'badge')) {
      const height = cascaded(badge, 'height');
      looks(badge, {
        display: 'inline-block',
        'max-width': 'calc(100% + var(--bubble-inset))',
        'line-height': height,
        'vertical-align': 'top',
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
        padding: '0 var(--bubble-inset)',
      });
      const margin = sidesOf(badge, 'margin');
      assert.strictEqual(margin.left, 'calc(-1 * var(--bubble-inset))');
      assert.strictEqual(line, 'var(--row-line-height)');
      assert.strictEqual(margin.top, '1px');
      assert.strictEqual(height, 'calc(var(--row-line-height) - 2px)');
    }
    looks(withClass(commit, 'bubble-line'), {
      'margin-left': 'calc(-1 * var(--bubble-inset))',
      'padding-left': 'var(--bubble-inset)',
    });
  });
});
