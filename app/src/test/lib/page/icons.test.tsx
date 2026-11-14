import * as assert from 'node:assert';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { tools } from '../../../shell/shared/tools';
import * as icons from '../../../lib/page/icons';
import {
  AddIcon,
  BookmarkIcon,
  ChangeIcon,
  CloseIcon,
  ExpandAllIcon,
} from '../../../lib/page/icons';

const kinds = ['added', 'modified', 'deleted', 'renamed'] as const;

function withoutProps(value: unknown): value is () => React.ReactNode {
  return typeof value === 'function' && value.length === 0;
}

function everyIcon(): { readonly name: string; readonly html: string }[] {
  const plain = Object.entries(icons).flatMap(([name, icon]) =>
    name.endsWith('Icon') && withoutProps(icon)
      ? [{ name, html: renderToStaticMarkup(createElement(icon)) }]
      : [],
  );
  return [
    ...plain,
    ...kinds.map((kind) => ({
      name: `ChangeIcon ${kind}`,
      html: renderToStaticMarkup(<ChangeIcon kind={kind} />),
    })),
    ...tools.map((tool) => ({
      name: `ToolIcon ${tool}`,
      html: renderToStaticMarkup(<icons.ToolIcon tool={tool} />),
    })),
    {
      name: 'BookmarkIcon',
      html: renderToStaticMarkup(<BookmarkIcon filled={false} />),
    },
  ];
}

const commandLength: Readonly<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

function straightStrokes(d: string): number[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const across: number[] = [];
  let command = 'M';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let at = 0;
  const line = (toX: number, toY: number, closing = false) => {
    if (closing && toX === x && toY === y) {
      return;
    }
    const dot = !closing && Math.abs(toX - x) < 0.1 && Math.abs(toY - y) < 0.1;
    if (dot || toX === x) {
      across.push(x);
    }
    if (dot || toY === y) {
      across.push(y);
    }
    x = toX;
    y = toY;
  };
  while (at < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[at])) {
      command = tokens[at];
      at += 1;
    }
    const upper = command.toUpperCase();
    const relative = command !== upper;
    const values = tokens.slice(at, at + commandLength[upper]).map(Number);
    at += commandLength[upper];
    const toX = (value: number) => value + (relative ? x : 0);
    const toY = (value: number) => value + (relative ? y : 0);
    if (upper === 'Z') {
      line(startX, startY, true);
    } else if (upper === 'M') {
      x = toX(values[0]);
      y = toY(values[1]);
      startX = x;
      startY = y;
      command = relative ? 'l' : 'L';
    } else if (upper === 'L') {
      line(toX(values[0]), toY(values[1]));
    } else if (upper === 'H') {
      line(toX(values[0]), y);
    } else if (upper === 'V') {
      line(x, toY(values[0]));
    } else {
      x = toX(values.at(-2) ?? 0);
      y = toY(values.at(-1) ?? 0);
    }
  }
  return across;
}

function strokedEdges(html: string): number[] {
  const paths = [...html.matchAll(/<path ([^>]*)>/g)].flatMap(([, tag]) =>
    /stroke="none"|stroke-width=/.test(tag)
      ? []
      : straightStrokes(/d="([^"]*)"/.exec(tag)?.[1] ?? ''),
  );
  const rects = [...html.matchAll(/<rect ([^>]*)>/g)].flatMap(([, tag]) => {
    const value = (name: string) =>
      Number(new RegExp(` ${name}="([^"]*)"`).exec(` ${tag}`)?.[1] ?? 0);
    return [
      value('x'),
      value('x') + value('width'),
      value('y'),
      value('y') + value('height'),
    ];
  });
  return [...paths, ...rects];
}

function strokesOfPaths(html: string): number[] {
  return [...html.matchAll(/<path d="([^"]*)"/g)].map(
    ([, d]) => d.match(/M/gi)?.length ?? 0,
  );
}

suite('Icons', () => {
  test('draws every straight stroke and dot of an icon on half a unit, so at 100% it fills a row or column of whole pixels rather than two half-tone ones', () => {
    const blurred = everyIcon().flatMap(({ name, html }) => {
      const off = strokedEdges(html).filter(
        (edge) => Math.abs((Math.abs(edge) % 1) - 0.5) > 1e-6,
      );
      return off.length > 0 ? [`${name}: ${off.join(' ')}`] : [];
    });
    assert.deepStrictEqual(blurred, []);
  });

  test('draws the two strokes of the close icon as paths of their own, as Chromium antialiases strokes crossing in one path unevenly, leaving the middle of the X blotchy', () => {
    assert.deepStrictEqual(
      strokesOfPaths(renderToStaticMarkup(<CloseIcon />)),
      [1, 1],
    );
  });

  test('draws the bookmark star filled for a folder bookmarked and as an outline otherwise, the same star either way', () => {
    const filled = renderToStaticMarkup(<BookmarkIcon filled />);
    const outline = renderToStaticMarkup(<BookmarkIcon filled={false} />);
    assert.match(filled, /class="icon bookmark-icon filled"/);
    assert.match(filled, /<path d="[^"]+" fill="currentColor"/);
    assert.match(outline, /class="icon bookmark-icon"/);
    assert.doesNotMatch(outline, /fill="currentColor"/);
    assert.strictEqual(
      /<path d="([^"]+)"/.exec(filled)?.[1],
      /<path d="([^"]+)"/.exec(outline)?.[1],
    );
  });

  test('draws the two strokes of every plus sign as paths of their own, as Chromium antialiases strokes crossing in one path unevenly, drawing one bar of the plus darker than the other', () => {
    assert.deepStrictEqual(
      [
        renderToStaticMarkup(<AddIcon />),
        renderToStaticMarkup(<ChangeIcon kind="added" />),
        renderToStaticMarkup(<ExpandAllIcon />),
      ].map(strokesOfPaths),
      [
        [1, 1],
        [1, 1],
        [1, 1, 1],
      ],
    );
  });
});
