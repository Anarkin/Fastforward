import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { ContextMenuItem } from '../../../../../lib/page/contextMenuItem';
import { strings } from '../../../../../lib/shared/strings';
import {
  boardMenuItems,
  showBoardMenu,
} from '../../../../../tools/canvas/page/boardMenu';
import type { OpenMenu } from '../../../../../lib/page/contextMenuItem';
import type { PathMenuAsk } from '../../../../../lib/page/pathMenu';
import type { Board } from '../../../../../tools/canvas/shared/board';
import type { NodeOrder } from '../../../../../tools/canvas/shared/protocol';

const labelsOf = (items: readonly ContextMenuItem[]) =>
  items.map((item) =>
    'separator' in item
      ? '-'
      : `${item.label}${item.checked === true ? ' ✓' : ''}${item.disabled === true ? ' (off)' : ''}`,
  );

const acted = () => {
  const done: (string | undefined)[] = [];
  return {
    done,
    act: {
      color: (color: string | undefined) => done.push(`color ${color}`),
      custom: () => done.push('custom'),
      order: (to: NodeOrder) => done.push(`order ${to}`),
    },
  };
};

suite('Canvas menu', () => {
  test('colors the nodes and edges chosen by one of the six colors of JSON Canvas or none, the color they share checked, and brings their nodes to the front or sends them to the back', () => {
    const { done, act } = acted();
    const items = boardMenuItems(
      { nodes: ['a'], edges: ['e'], colors: ['4', '4'] },
      act,
    );
    assert.deepStrictEqual(labelsOf(items), [
      strings.canvas.color,
      '-',
      strings.canvas.toFront,
      strings.canvas.toBack,
    ]);
    const [color, , front, back] = items;
    assert.ok(color !== undefined && !('separator' in color));
    assert.deepStrictEqual(labelsOf(color.submenu ?? []), [
      strings.canvas.noColor,
      ...strings.canvas.colors.map((name, at) =>
        at === 3 ? `${name} ✓` : name,
      ),
      '-',
      strings.canvas.customColor,
    ]);
    for (const item of [...(color.submenu ?? []), front, back]) {
      if (item !== undefined && !('separator' in item)) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(done, [
      'color undefined',
      'color 1',
      'color 2',
      'color 3',
      'color 4',
      'color 5',
      'color 6',
      'custom',
      'order front',
      'order back',
    ]);
  });

  test('checks no color while the chosen differ in theirs, none while none has one, and leaves the order off for edges alone and everything off with nothing chosen', () => {
    const { act } = acted();
    const colorOf = (colors: readonly (string | undefined)[]) => {
      const [color] = boardMenuItems({ nodes: [], edges: ['e'], colors }, act);
      assert.ok(color !== undefined && !('separator' in color));
      return labelsOf(color.submenu ?? []).filter((label) =>
        label.endsWith('✓'),
      );
    };
    assert.deepStrictEqual(colorOf(['1', '2']), []);
    assert.deepStrictEqual(colorOf(['#123456', '#123456']), [
      `${strings.canvas.customColor} ✓`,
    ]);
    assert.deepStrictEqual(colorOf([undefined]), [
      `${strings.canvas.noColor} ✓`,
    ]);
    assert.deepStrictEqual(
      labelsOf(boardMenuItems({ nodes: [], edges: ['e'], colors: ['1'] }, act)),
      [
        strings.canvas.color,
        '-',
        `${strings.canvas.toFront} (off)`,
        `${strings.canvas.toBack} (off)`,
      ],
    );
    assert.deepStrictEqual(
      labelsOf(boardMenuItems({ nodes: [], edges: [], colors: [] }, act)),
      [
        `${strings.canvas.color} (off)`,
        '-',
        `${strings.canvas.toFront} (off)`,
        `${strings.canvas.toBack} (off)`,
      ],
    );
  });

  test('puts File first for a file node, the menu of its path as every path has it, Link for a link node, opening it with the OS or copying its URL apart, as the menu of a path puts copying apart, each over a divider and the colors', () => {
    const box = { x: 0, y: 0, width: 70, height: 54 };
    const board: Board = {
      nodes: [
        { id: 'f', type: 'file', file: 'a.md', ...box },
        { id: 'g', type: 'file', file: 'gone.md', ...box },
        { id: 'l', type: 'link', url: 'https://a.example/', ...box },
        { id: 't', type: 'text', text: '', ...box },
      ],
      edges: [],
    };
    const shown: OpenMenu[] = [];
    const asked: PathMenuAsk[] = [];
    const copied: string[] = [];
    const rightClicked = (id: string) =>
      showBoardMenu(
        board,
        [],
        { kind: 'node', id },
        {
          at: { x: 1, y: 2 },
          select: () => {},
          show: (menu) => shown.push(menu),
          send: () => {},
          custom: () => {},
          files: { 'a.md': { path: '/vault/a.md' } },
          openPathMenu: (ask) => asked.push(ask),
          copy: (text) => copied.push(text),
        },
      );

    rightClicked('f');
    const [ask] = asked;
    assert.deepStrictEqual(
      [ask?.path, ask?.file, ask?.at],
      ['/vault/a.md', true, { x: 1, y: 2 }],
    );
    const pathItems: ContextMenuItem[] = [{ label: 'Open with OS' }];
    const wrapped = ask?.within?.(pathItems) ?? [];
    const [head] = wrapped;
    assert.ok(head !== undefined && !('separator' in head));
    assert.deepStrictEqual(head.submenu, pathItems);
    assert.deepStrictEqual(labelsOf(wrapped).slice(0, 3), [
      strings.canvas.fileMenu,
      '-',
      strings.canvas.color,
    ]);

    rightClicked('g');
    rightClicked('l');
    rightClicked('t');
    assert.deepStrictEqual(
      shown.map((menu) => labelsOf(menu.items)[0]),
      [
        `${strings.canvas.fileMenu} (off)`,
        strings.canvas.linkMenu,
        strings.canvas.color,
      ],
    );
    const link = shown[1]?.items[0];
    assert.ok(link !== undefined && !('separator' in link));
    assert.deepStrictEqual(labelsOf(link.submenu ?? []), [
      strings.commander.openWithSystem,
      '-',
      strings.canvas.copyUrl,
    ]);
    const copy = link.submenu?.[2];
    assert.ok(copy !== undefined && !('separator' in copy));
    copy.onClick?.();
    assert.deepStrictEqual(copied, ['https://a.example/']);
  });
});
