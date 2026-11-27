import type {
  ContextMenuItem,
  OpenMenu,
} from '../../../lib/page/contextMenuItem';
import type { PathMenuAsk } from '../../../lib/page/pathMenu';
import { strings } from '../../../lib/shared/strings';
import type { Board } from '../shared/board';
import type { BoardEdit, NodeFile, NodeOrder } from '../shared/protocol';
import type { Hit } from './hits';
import { openLink } from './links';

export interface Chosen {
  readonly nodes: readonly string[];
  readonly edges: readonly string[];
  readonly colors: readonly (string | undefined)[];
}

export interface MenuActs {
  readonly color: (color: string | undefined) => void;
  readonly custom: () => void;
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
        { separator: true },
        {
          label: strings.canvas.customColor,
          checked: typeof shared === 'string' && shared.startsWith('#'),
          onClick: act.custom,
        },
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

function chosenAt(selected: readonly string[], hit: Hit): readonly string[] {
  const id =
    hit.kind === 'node' || hit.kind === 'edge' || hit.kind === 'handle'
      ? hit.id
      : undefined;
  return id === undefined || selected.includes(id) ? selected : [id];
}

interface ChosenIds {
  readonly nodes: readonly string[];
  readonly edges: readonly string[];
}

function boardMenuOf(
  board: Board,
  chosen: readonly string[],
  {
    send,
    custom,
  }: {
    readonly send: (edit: BoardEdit) => void;
    readonly custom: (ids: ChosenIds) => void;
  },
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
      custom: () => {
        custom(ids);
      },
      order: (to) => {
        send({ kind: 'order', nodes: ids.nodes, to });
      },
    },
  );
}

export interface BoardMenuShell {
  readonly at: { readonly x: number; readonly y: number };
  readonly select: (ids: readonly string[]) => void;
  readonly show: (menu: OpenMenu) => void;
  readonly send: (edit: BoardEdit) => void;
  readonly custom: (ids: ChosenIds) => void;
  readonly files: Readonly<Record<string, NodeFile>> | undefined;
  readonly openPathMenu: (ask: PathMenuAsk) => void;
  readonly copy: (text: string) => void;
}

const headed = (
  head: ContextMenuItem,
  items: readonly ContextMenuItem[],
): ContextMenuItem[] => [head, { separator: true }, ...items];

export function showBoardMenu(
  board: Board,
  selected: readonly string[],
  hit: Hit,
  shell: BoardMenuShell,
): void {
  const { at, select, show, send, custom, files, openPathMenu, copy } = shell;
  const chosen = chosenAt(selected, hit);
  if (chosen !== selected) {
    select(chosen);
  }
  const items = boardMenuOf(board, chosen, { send, custom });
  const [only] = chosen.length === 1 ? chosen : [];
  const node = board.nodes.find((each) => each.id === only);
  if (node?.type === 'file') {
    const path = files?.[node.file]?.path;
    if (path === undefined) {
      show({
        ...at,
        items: headed(
          { label: strings.canvas.fileMenu, disabled: true },
          items,
        ),
      });
      return;
    }
    openPathMenu({
      path,
      file: true,
      at,
      extended: false,
      within: (fileItems) =>
        headed({ label: strings.canvas.fileMenu, submenu: fileItems }, items),
    });
    return;
  }
  if (node?.type === 'link') {
    const { url } = node;
    show({
      ...at,
      items: headed(
        {
          label: strings.canvas.linkMenu,
          submenu: [
            {
              label: strings.commander.openWithSystem,
              onClick: () => openLink(url),
            },
            { label: strings.canvas.copyUrl, onClick: () => copy(url) },
          ],
        },
        items,
      ),
    });
    return;
  }
  show({ ...at, items });
}
