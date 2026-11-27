import type { ContextMenuItem } from '../../../lib/page/contextMenuItem';
import { strings } from '../../../lib/shared/strings';
import type { Board } from '../shared/board';
import type { BoardEdit, NodeOrder } from '../shared/protocol';
import type { Hit } from './hits';

export interface Chosen {
  readonly nodes: readonly string[];
  readonly edges: readonly string[];
  readonly colors: readonly (string | undefined)[];
}

export interface MenuActs {
  readonly color: (color: string | undefined) => void;
  readonly order: (to: NodeOrder) => void;
}

const presetNames = strings.canvas.colors;

const mixed = Symbol('mixed');

function sharedColor(
  colors: readonly (string | undefined)[],
): string | undefined | typeof mixed {
  const [first] = colors;
  return colors.every((color) => color === first) ? first : mixed;
}

export function boardMenuItems(
  { nodes, edges, colors }: Chosen,
  act: MenuActs,
): ContextMenuItem[] {
  const shared = sharedColor(colors);
  const nothing = nodes.length === 0 && edges.length === 0;
  const noNodes = nodes.length === 0;
  return [
    {
      label: strings.canvas.color,
      disabled: nothing,
      submenu: [
        {
          label: strings.canvas.noColor,
          checked: shared === undefined,
          onClick: () => act.color(undefined),
        },
        ...presetNames.map((name, at) => {
          const color = String(at + 1);
          return {
            label: name,
            checked: shared === color,
            onClick: () => act.color(color),
          };
        }),
      ],
    },
    { separator: true },
    {
      label: strings.canvas.toFront,
      disabled: noNodes,
      onClick: () => act.order('front'),
    },
    {
      label: strings.canvas.toBack,
      disabled: noNodes,
      onClick: () => act.order('back'),
    },
  ];
}

export function chosenAt(
  selected: readonly string[],
  hit: Hit,
): readonly string[] {
  const id =
    hit.kind === 'node' || hit.kind === 'edge' || hit.kind === 'handle'
      ? hit.id
      : undefined;
  return id === undefined || selected.includes(id) ? selected : [id];
}

export function boardMenuOf(
  board: Board,
  chosen: readonly string[],
  send: (edit: BoardEdit) => void,
): ContextMenuItem[] {
  const nodes = board.nodes.filter((each) => chosen.includes(each.id));
  const edges = board.edges.filter((each) => chosen.includes(each.id));
  const ids = {
    nodes: nodes.map((each) => each.id),
    edges: edges.map((each) => each.id),
  };
  return boardMenuItems(
    { ...ids, colors: [...nodes, ...edges].map((each) => each.color) },
    {
      color: (color) => {
        send({
          kind: 'color',
          ...ids,
          ...(color === undefined ? {} : { color }),
        });
      },
      order: (to) => {
        send({ kind: 'order', nodes: ids.nodes, to });
      },
    },
  );
}
