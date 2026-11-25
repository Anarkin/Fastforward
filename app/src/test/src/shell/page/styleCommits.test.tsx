import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { columnFocusAttribute } from '../../../../lib/page/columnFocus';
import { Column } from '../../../../lib/page/column';
import { cascaded } from '../../../helpers/cascade';
import { ColumnShown } from '../../../helpers/styleFixtures';
import { columnTitle, repository } from '../../../helpers/styleMarkup';
import { buttonsWidth, pixels, looks, focused } from './stylesheetFixtures';
import {
  bubbleLineHeight,
  commitRowHeight,
  workingTreeRowHeight,
} from '../../../../tools/git/page/commitListRows';
import { renderedBy } from '../../../helpers/componentFixtures';
import { rendered, withClass } from '../../../helpers/markup';
import {
  CommitColumn,
  CommitRowShown,
  MessagePanelShown,
  NavButtonsShown,
  WorkingTreeRowShown,
} from '../../../helpers/styleHistoryFixtures';

suite('Style', () => {
  test("keeps the commit column's title clear of its buttons and the gaps between them", () => {
    const title = columnTitle(<CommitColumn autoFetchMinutes={0} />);
    assert.strictEqual(
      pixels(cascaded(title, 'padding-left')),
      buttonsWidth(<CommitColumn />, <ColumnShown start={null} />, 4),
    );
    assert.strictEqual(
      pixels(cascaded(title, 'padding-right')),
      buttonsWidth(<CommitColumn />, <ColumnShown start={null} />, 2, 'right'),
    );
    assert.strictEqual(
      pixels(
        cascaded(
          columnTitle(<CommitColumn autoFetchMinutes={5} />),
          'padding-left',
        ),
      ),
      buttonsWidth(<CommitColumn />, <ColumnShown start={null} />, 5),
    );
  });

  test('writes the title of the checked-out commit in bold, in its whole message too', () => {
    const checkedOut = withClass(
      rendered(<CommitRowShown headCommit="a" />),
      'subject',
    );
    looks(checkedOut, { 'font-weight': '600' });
    looks(withClass(rendered(<CommitRowShown headCommit="b" />), 'subject'), {
      'font-weight': undefined,
    });
    looks(
      withClass(rendered(<MessagePanelShown headCommit="a" />), 'subject'),
      {
        'font-weight': cascaded(checkedOut, 'font-weight'),
      },
    );
    looks(
      withClass(rendered(<MessagePanelShown headCommit="b" />), 'subject'),
      {
        'font-weight': undefined,
      },
    );
  });

  test('dims a clean working tree like an author or a folder', () => {
    looks(withClass(rendered(<WorkingTreeRowShown count={0} />), 'subject'), {
      opacity: 'var(--muted-opacity)',
    });
    looks(withClass(rendered(<WorkingTreeRowShown count={1} />), 'subject'), {
      opacity: undefined,
    });
  });

  test('draws a commit row and the one-line working tree row as tall as the list expects, as lines of the line height of the settings with nothing above or below them', () => {
    const commit = rendered(<CommitRowShown refs={repository.refs} />);
    for (const row of [commit, rendered(<WorkingTreeRowShown count={1} />)]) {
      looks(row, {
        padding: '0 8px',
        'border-bottom': undefined,
      });
      looks(withClass(row, 'commit-line'), {
        height: 'var(--row-line-height)',
      });
    }
    looks(withClass(commit, 'commit-line', 'secondary'), {
      height: 'var(--row-line-height)',
      margin: undefined,
      'margin-top': undefined,
      'margin-bottom': undefined,
    });
    looks(withClass(commit, 'bubble-line'), {
      'line-height': 'var(--row-line-height)',
    });
    assert.deepStrictEqual(
      [commitRowHeight, workingTreeRowHeight, bubbleLineHeight],
      [2 * 18, 18, 18],
    );
  });

  test('draws no lines between the commits of the commit column, so its lines fall on those of the other columns, and keeps the line under its title, as the other columns have it', () => {
    const column = rendered(
      renderedBy(Column, {
        start: <NavButtonsShown />,
        children: (
          <div className="virtual-rows list commit-rows">
            {<CommitRowShown />}
          </div>
        ),
      }),
    );
    looks(withClass(column, 'commit'), {
      'border-bottom': undefined,
      'border-bottom-color': undefined,
    });
    for (const title of [
      withClass(column, 'column-title'),
      columnTitle(<ColumnShown start={null} />),
    ]) {
      looks(title, {
        'border-bottom': '1px solid var(--color-border)',
        'border-bottom-color': undefined,
      });
    }
  });

  test('lays the canvas of the graph over the rows it draws, from the left of the list, taking no pointer, so the rows beneath it are hovered, pressed and dragged as before, its canvas filling it, and a merge it draws pressed through a target of its own in the row, above it', () => {
    const layer = rendered(
      <div className="virtual-spacer">
        <div className="graph-layer">
          <canvas className="commit-canvas" />
        </div>
      </div>,
    );
    looks(withClass(layer, 'graph-layer'), {
      position: 'sticky',
      top: '0',
      left: '0',
      'z-index': '1',
      'pointer-events': 'none',
    });
    looks(withClass(layer, 'commit-canvas'), {
      display: 'block',
      width: '100%',
      height: '100%',
    });
    looks(withClass(rendered(<span className="commit-tip" />), 'commit-tip'), {
      position: 'absolute',
    });
  });

  test('draws no focus outline around the commit list, whose selected row shows where the keys go', () => {
    const list = rendered(
      <div className="virtual-rows list" {...{ [columnFocusAttribute]: '' }} />,
    );
    for (const states of [{}, focused]) {
      looks(list, { outline: 'none' }, states);
    }
  });
});
