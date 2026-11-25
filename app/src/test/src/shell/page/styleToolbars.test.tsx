import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { Column } from '../../../../lib/page/column';
import { ToolbarSpace } from '../../../../lib/page/toolbar';
import { cascaded } from '../../../helpers/cascade';
import { renderedBy } from '../../../helpers/componentFixtures';
import {
  allWithClass,
  rendered,
  withClass,
  type MarkupElement,
} from '../../../helpers/markup';
import {
  DiffFindShown,
  DiffOptionsShown,
} from '../../../helpers/styleDiffFixtures';
import {
  MenuButtonShown,
  SearchButtonShown,
} from '../../../helpers/styleFixtures';
import {
  LocationsPopupShown,
  NavButtonsShown,
} from '../../../helpers/styleHistoryFixtures';
import {
  bodyVariable,
  deviceRounded,
  looks,
  unwrapped,
} from './stylesheetFixtures';

const insides = ['nav-button', 'search-box'];

const spacings = [
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-inline',
  'margin-inline-start',
  'margin-inline-end',
];

const paddings = [
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-inline',
];

function isInside(element: MarkupElement): boolean {
  return insides.some((name) => element.classes.includes(name));
}

function partsOf(toolbar: MarkupElement): MarkupElement[] {
  return toolbar.children.flatMap((child) =>
    isInside(child) ? [child] : [child, ...partsOf(child)],
  );
}

function spacedByItself(part: MarkupElement): string[] {
  const set = (properties: readonly string[]) =>
    properties.filter((property) => cascaded(part, property) !== undefined);
  const gap = cascaded(part, 'gap');
  return [
    ...set(spacings),
    ...(isInside(part)
      ? []
      : [
          ...set(paddings),
          ...(gap === undefined || gap === 'var(--bar-space)' ? [] : ['gap']),
          ...(part.children.length === 0 &&
          !part.classes.includes('toolbar-space')
            ? ['empty']
            : []),
        ]),
  ].map((property) => `${part.classes.join('.')} ${property}`);
}

function barsShown(): MarkupElement[] {
  return [
    rendered(
      renderedBy(Column, {
        start: <DiffOptionsShown />,
        actions: <MenuButtonShown label="Details" />,
        search: <SearchButtonShown />,
        children: null,
      }),
    ),
    rendered(
      renderedBy(Column, {
        start: <NavButtonsShown autoFetch autoFetchMinutes={5} />,
        actions: <ToolbarSpace />,
        children: null,
      }),
    ),
    rendered(
      renderedBy(Column, {
        searching: <DiffFindShown query="a" />,
        children: null,
      }),
    ),
    rendered(<LocationsPopupShown query="" />),
  ];
}

function blocks(className: string): MarkupElement {
  return withClass(
    rendered(
      <div className={className}>
        {renderedBy(Column, {
          start: <span />,
          actions: <span />,
          children: null,
        })}
      </div>,
    ),
    'column',
  );
}

suite('Style', () => {
  test('stands the buttons of a header the one space of a bar from the line around its column on every side, the header as tall as that line, the space, a button, the space and the line under it, the search over the commits alike, so its buttons are as far from its top and its bottom as from either end and none moves as a search opens', () => {
    assert.strictEqual(deviceRounded('bar-space'), 4);
    assert.strictEqual(
      bodyVariable('hairline'),
      'round(down, 1px, var(--device-pixel, 1px))',
    );
    const column = rendered(
      renderedBy(Column, {
        start: <span />,
        actions: <span />,
        children: null,
      }),
    );
    assert.strictEqual(
      unwrapped(cascaded(column, '--bar-edge')),
      'calc(var(--column-line, 0px) + var(--bar-space))',
    );
    assert.strictEqual(
      unwrapped(cascaded(column, '--title-height')),
      'calc(var(--column-line, 0px) + 2 * var(--bar-space) + var(--button-size) + var(--title-line))',
    );
    assert.strictEqual(cascaded(column, '--title-line'), 'var(--hairline)');
    const title = withClass(column, 'column-title');
    looks(title, {
      'box-sizing': 'border-box',
      height: 'var(--title-height)',
      'align-items': 'center',
      'border-bottom': '1px solid var(--color-border)',
    });
    assert.strictEqual(
      cascaded(column, '--title-above'),
      'var(--column-line, 0px)',
    );
    assert.strictEqual(cascaded(column, '--title-below'), '0px');
    const ends = { top: 'var(--title-above)', bottom: 'var(--title-below)' };
    looks(withClass(title, 'column-start'), {
      ...ends,
      left: 'var(--bar-edge)',
    });
    looks(withClass(title, 'column-actions'), {
      ...ends,
      right: 'var(--bar-edge)',
    });
    const padding = 'var(--title-above) var(--bar-edge) var(--title-below)';
    looks(
      withClass(rendered(<LocationsPopupShown query="" />), 'locations-bar'),
      {
        'box-sizing': 'border-box',
        height: 'calc(var(--title-height) - var(--title-line))',
        'align-items': 'center',
        padding,
      },
    );
  });

  test('stands the buttons of the header of a block whose bars stand outside its frame at its top and at either end of it, no line around them and the space of a bar under them alone, the line of the block starting under its header, a search opened in place of the header as tall as it is, with no line of the header to leave out, as the frame stood around the buttons of the only block of a tab, of the two sides of the commander, which the row selected tells apart, and of the three columns of git, which the blue of the selection tells apart', () => {
    const single = blocks('columns bars-outside');
    assert.strictEqual(cascaded(single, '--bar-edge'), '0px');
    assert.strictEqual(cascaded(single, '--title-above'), '0px');
    assert.strictEqual(cascaded(single, '--title-below'), 'var(--bar-space)');
    assert.strictEqual(cascaded(single, '--title-line'), '0px');
    assert.strictEqual(
      unwrapped(cascaded(single, '--title-height')),
      'calc(var(--button-size) + var(--bar-space))',
    );
    const framed = { pseudoElement: '::after' };
    looks(
      single,
      {
        top: 'var(--title-height)',
        'box-shadow': 'inset 0 0 0 var(--frame-line) var(--color-border)',
      },
      framed,
    );
    looks(withClass(single, 'column-title'), {
      height: 'var(--title-height)',
      padding: 'var(--title-above) 8px var(--title-below)',
      'border-bottom': 'none',
    });
    const several = blocks('columns');
    assert.strictEqual(
      unwrapped(cascaded(several, '--bar-edge')),
      'calc(var(--column-line, 0px) + var(--bar-space))',
    );
    looks(several, { top: undefined }, framed);
  });

  test('spaces what stands in a toolbar by the one space of a bar alone, as far apart as from the line around them, a toolbar inside another too: nothing in it has a margin, a padding or a gap of its own but the inside of a button and of a search field, and nothing empty stands in it but the space as wide as a button', () => {
    const toolbars = barsShown().flatMap((bar) => allWithClass(bar, 'toolbar'));
    assert.ok(toolbars.length >= 9, String(toolbars.length));
    for (const toolbar of toolbars) {
      looks(toolbar, {
        display: 'flex',
        'align-items': 'center',
        gap: 'var(--bar-space)',
      });
    }
    const parts = toolbars.flatMap(partsOf);
    assert.ok(
      parts.filter((part) => part.classes.includes('nav-button')).length > 20,
    );
    assert.deepStrictEqual(parts.flatMap(spacedByItself), []);
    assert.deepStrictEqual(
      spacedByItself(rendered(<span className="menu-button" />)),
      ['menu-button empty'],
    );
    looks(rendered(<ToolbarSpace />), {
      flex: 'none',
      width: 'var(--button-size)',
    });
    for (const part of parts.filter(isInside)) {
      assert.ok(
        ['var(--button-size)', 'var(--search-height)'].includes(
          cascaded(part, 'height') ?? '',
        ),
        part.classes.join('.'),
      );
    }
  });
});
