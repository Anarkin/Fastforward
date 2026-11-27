import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { ContextMenuItem } from '../../../../../lib/page/contextMenuItem';
import { strings } from '../../../../../lib/shared/strings';
import { boardMenuItems } from '../../../../../tools/canvas/page/boardMenu';
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
});
