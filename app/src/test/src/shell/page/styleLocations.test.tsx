import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { RefBubble } from '../../../../tools/git/page/bubbles';
import { cascaded, matchingRules } from '../../../helpers/cascade';
import { columnTitle } from '../../../helpers/styleMarkup';
import { looks, hovered } from './stylesheetFixtures';
import { allWithClass, rendered, withClass } from '../../../helpers/markup';
import {
  CommitColumn,
  CommitRowShown,
  CommitsFoundShown,
  LocationsPopupShown,
} from '../../../helpers/styleHistoryFixtures';

function badgeRules(node: React.ReactNode): string[] {
  return matchingRules(withClass(rendered(node), 'badge')).map(
    (rule) => rule.selector,
  );
}

suite('Style', () => {
  test("opens the search over the commit column's title without moving its field or back button", () => {
    const title = columnTitle(<CommitColumn autoFetchMinutes={0} />);
    assert.strictEqual(cascaded(title, 'height'), 'var(--title-height)');
    const border = cascaded(title, 'border-bottom');
    const [line] = (border ?? '').split(' ');
    assert.strictEqual(
      cascaded(
        withClass(
          rendered(<LocationsPopupShown query="" />),
          'locations-groups',
        ),
        'border-top',
      ),
      border,
    );
    const edge = cascaded(withClass(title, 'column-start'), 'left');
    assert.strictEqual(edge, 'var(--bar-edge)');
    assert.strictEqual(line, '1px');
    looks(
      withClass(rendered(<LocationsPopupShown query="" />), 'locations-bar'),
      {
        height: 'calc(var(--title-height) - var(--title-line))',
        'box-sizing': 'border-box',
        margin: undefined,
        'margin-top': undefined,
        'margin-bottom': undefined,
        padding: `var(--title-above) ${edge} var(--title-below)`,
      },
    );
  });

  test("keeps the line under the field of the search opened over the commit column's title, where the title's is, and draws none between its groups nor between the commits it found, as the list draws none", () => {
    const popup = rendered(<LocationsPopupShown query="" />);
    const groups = allWithClass(popup, 'locations-group');
    assert.ok(groups.length > 1, String(groups.length));
    looks(withClass(popup, 'locations-groups'), {
      'border-top': '1px solid var(--color-border)',
      'border-top-color': undefined,
    });
    for (const group of groups.slice(1)) {
      looks(group, {
        'border-top': undefined,
        'border-top-color': undefined,
      });
    }
    const found = allWithClass(
      rendered(<CommitsFoundShown query="next" />),
      'commit',
    );
    assert.strictEqual(found.length, 2);
    for (const commit of found) {
      looks(commit, {
        'border-bottom': undefined,
        'border-bottom-color': undefined,
      });
    }
  });

  test('lays the search opened over the commit column out in lines of the line height of the settings, as the columns beside it, each heading, row and note a line with nothing above or below it, and its groups one under the other', () => {
    const popup = rendered(<LocationsPopupShown query="" />);
    const groups = allWithClass(popup, 'locations-group');
    assert.ok(groups.length > 1, String(groups.length));
    for (const group of groups) {
      looks(group, {
        margin: undefined,
        'margin-top': undefined,
        padding: undefined,
      });
      looks(withClass(group, 'locations-heading'), {
        padding: '0 8px',
        'padding-top': undefined,
        'line-height': 'var(--row-line-height)',
      });
      looks(withClass(group, 'locations-list'), {
        padding: undefined,
        'padding-bottom': undefined,
      });
    }
    const rows = allWithClass(popup, 'row');
    assert.ok(rows.length > 1, String(rows.length));
    for (const row of rows) {
      looks(row, {
        height: 'var(--row-line-height)',
        'line-height': 'var(--row-line-height)',
      });
    }
    looks(rendered(<div className="locations-empty" />), {
      padding: '0 8px',
      'line-height': 'var(--row-line-height)',
    });
    looks(
      withClass(
        rendered(<LocationsPopupShown query="abcd" />),
        'hash-suggestion',
        'empty',
      ),
      {
        height: 'var(--row-line-height)',
        padding: '0 8px',
        margin: undefined,
        'margin-top': undefined,
      },
    );
  });

  test("draws the bubbles of a commit a search found as in the commit list, cutting off only a ref that is a result's own row", () => {
    const commit = (
      <CommitRowShown refs={[{ kind: 'branch', name: 'main', commit: 'a' }]} />
    );
    assert.deepStrictEqual(
      badgeRules(<div className="locations-list">{commit}</div>),
      badgeRules(commit),
    );
    looks(
      withClass(
        rendered(
          <div className="locations-list">
            <div className="row result">
              <RefBubble info={{ kind: 'branch', name: 'main' }} />
            </div>
          </div>,
        ),
        'badge',
      ),
      { overflow: 'hidden', 'text-overflow': 'ellipsis' },
    );
  });

  test("lays a sticky location row's see-through hover color over its solid background, so rows under it stay hidden", () => {
    const sticky = withClass(
      rendered(<LocationsPopupShown query="" />),
      'tree-row',
      'sticky',
    );
    looks(sticky, { background: 'var(--popup-background)' });
    looks(
      sticky,
      {
        background:
          'linear-gradient(var(--hover-background), var(--hover-background)), var(--popup-background)',
      },
      hovered,
    );
  });
});
